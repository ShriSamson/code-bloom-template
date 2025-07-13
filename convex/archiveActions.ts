"use node";

import { action, internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Internal action to do the actual content fetching
export const fetchContentWorker = internalAction({
  args: { jobId: v.id("archiveJobs") },
  handler: async (ctx, args) => {
    // Update job status to running
    await ctx.runMutation(api.archiveMutations.updateJobStatus, {
      jobId: args.jobId,
      status: "running",
    });

    try {
      const job = await ctx.runQuery(api.archiveMutations.getJob, { jobId: args.jobId });
      if (!job) {
        throw new Error("Job not found");
      }

      let totalProcessed = 0;

      for (const platform of job.platforms) {
        if (platform === "ea-forum") {
          const content = await fetchEAForumContent(job.username);
          await ctx.runMutation(api.archiveMutations.saveContent, {
            jobId: args.jobId,
            content: content,
          });
          totalProcessed += content.length;
        }
        
        if (platform === "lesswrong") {
          const content = await fetchLessWrongContent(job.username);
          await ctx.runMutation(api.archiveMutations.saveContent, {
            jobId: args.jobId,
            content: content,
          });
          totalProcessed += content.length;
        }
      }

      // Mark job as completed
      await ctx.runMutation(api.archiveMutations.updateJobStatus, {
        jobId: args.jobId,
        status: "completed",
        processedItems: totalProcessed,
        totalItems: totalProcessed,
      });

    } catch (error) {
      await ctx.runMutation(api.archiveMutations.updateJobStatus, {
        jobId: args.jobId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// Helper function to fetch EA Forum content
async function fetchEAForumContent(username: string) {
  const endpoint = "https://forum.effectivealtruism.org/graphql";
  
  // First, get user info to find their ID
  const userQuery = `
    query GetUser($slug: String!) {
      user(input: { selector: { slug: $slug } }) {
        result {
          _id
          username
          slug
        }
      }
    }
  `;

  const userResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: userQuery,
      variables: { slug: username },
    }),
  });

  if (!userResponse.ok) {
    throw new Error(`EA Forum user fetch failed: ${userResponse.statusText}`);
  }

  const userData = await userResponse.json();
  const user = userData.data?.user?.result;
  
  if (!user) {
    throw new Error(`User "${username}" not found on EA Forum`);
  }

  // Fetch posts
  const postsQuery = `
    query GetUserPosts($userId: String!) {
      posts(input: { 
        terms: { 
          view: "userPosts", 
          userId: $userId 
        } 
      }) {
        results {
          _id
          title
          htmlBody
          slug
          pageUrl
          postedAt
          baseScore
          voteCount
          wordCount
          question
        }
      }
    }
  `;

  const postsResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: postsQuery,
      variables: { userId: user._id },
    }),
  });

  if (!postsResponse.ok) {
    throw new Error(`EA Forum posts fetch failed: ${postsResponse.statusText}`);
  }

  const postsData = await postsResponse.json();
  const posts = postsData.data?.posts?.results || [];

  // Fetch comments
  const commentsQuery = `
    query GetUserComments($userId: String!) {
      comments(input: { 
        terms: { 
          view: "userComments", 
          userId: $userId 
        } 
      }) {
        results {
          _id
          htmlBody
          pageUrl
          postedAt
          baseScore
          voteCount
          wordCount
          post {
            title
            slug
          }
        }
      }
    }
  `;

  const commentsResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: commentsQuery,
      variables: { userId: user._id },
    }),
  });

  if (!commentsResponse.ok) {
    throw new Error(`EA Forum comments fetch failed: ${commentsResponse.statusText}`);
  }

  const commentsData = await commentsResponse.json();
  const comments = commentsData.data?.comments?.results || [];

  const content = [];

  // Process posts
  for (const post of posts) {
    content.push({
      platform: "ea-forum",
      contentType: post.question ? "shortform" : "post",
      title: post.title,
      content: stripHtml(post.htmlBody || ""),
      url: post.pageUrl || `https://forum.effectivealtruism.org/posts/${post.slug}`,
      datePosted: post.postedAt,
      score: post.baseScore || post.voteCount,
      wordCount: post.wordCount || countWords(post.htmlBody || ""),
      username: username,
      originalId: post._id,
    });
  }

  // Process comments
  for (const comment of comments) {
    content.push({
      platform: "ea-forum",
      contentType: "comment",
      content: stripHtml(comment.htmlBody || ""),
      url: comment.pageUrl || "",
      datePosted: comment.postedAt,
      score: comment.baseScore || comment.voteCount,
      parentTitle: comment.post?.title,
      wordCount: comment.wordCount || countWords(comment.htmlBody || ""),
      username: username,
      originalId: comment._id,
    });
  }

  return content;
}

// Helper function to fetch LessWrong content
async function fetchLessWrongContent(username: string) {
  const endpoint = "https://www.lesswrong.com/graphql";
  
  // The LessWrong API uses the same structure as EA Forum since they share the same codebase
  const userQuery = `
    query GetUser($slug: String!) {
      user(input: { selector: { slug: $slug } }) {
        result {
          _id
          username
          slug
        }
      }
    }
  `;

  const userResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: userQuery,
      variables: { slug: username },
    }),
  });

  if (!userResponse.ok) {
    throw new Error(`LessWrong user fetch failed: ${userResponse.statusText}`);
  }

  const userData = await userResponse.json();
  const user = userData.data?.user?.result;
  
  if (!user) {
    throw new Error(`User "${username}" not found on LessWrong`);
  }

  // Fetch posts and comments using the same queries as EA Forum
  const [postsResponse, commentsResponse] = await Promise.all([
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetUserPosts($userId: String!) {
            posts(input: { 
              terms: { 
                view: "userPosts", 
                userId: $userId 
              } 
            }) {
              results {
                _id
                title
                htmlBody
                slug
                pageUrl
                postedAt
                baseScore
                voteCount
                wordCount
                question
              }
            }
          }
        `,
        variables: { userId: user._id },
      }),
    }),
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetUserComments($userId: String!) {
            comments(input: { 
              terms: { 
                view: "userComments", 
                userId: $userId 
              } 
            }) {
              results {
                _id
                htmlBody
                pageUrl
                postedAt
                baseScore
                voteCount
                wordCount
                post {
                  title
                  slug
                }
              }
            }
          }
        `,
        variables: { userId: user._id },
      }),
    }),
  ]);

  if (!postsResponse.ok || !commentsResponse.ok) {
    throw new Error(`LessWrong content fetch failed`);
  }

  const [postsData, commentsData] = await Promise.all([
    postsResponse.json(),
    commentsResponse.json(),
  ]);

  const posts = postsData.data?.posts?.results || [];
  const comments = commentsData.data?.comments?.results || [];
  const content = [];

  // Process posts
  for (const post of posts) {
    content.push({
      platform: "lesswrong",
      contentType: post.question ? "shortform" : "post",
      title: post.title,
      content: stripHtml(post.htmlBody || ""),
      url: post.pageUrl || `https://www.lesswrong.com/posts/${post.slug}`,
      datePosted: post.postedAt,
      score: post.baseScore || post.voteCount,
      wordCount: post.wordCount || countWords(post.htmlBody || ""),
      username: username,
      originalId: post._id,
    });
  }

  // Process comments
  for (const comment of comments) {
    content.push({
      platform: "lesswrong",
      contentType: "comment",
      content: stripHtml(comment.htmlBody || ""),
      url: comment.pageUrl || "",
      datePosted: comment.postedAt,
      score: comment.baseScore || comment.voteCount,
      parentTitle: comment.post?.title,
      wordCount: comment.wordCount || countWords(comment.htmlBody || ""),
      username: username,
      originalId: comment._id,
    });
  }

  return content;
}

// Utility functions
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export const exportToCsv = action({
  args: { jobId: v.id("archiveJobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the job to verify ownership
    const job = await ctx.runQuery(api.archiveMutations.getJob, { jobId: args.jobId });
    if (!job) {
      throw new ConvexError("Job not found");
    }

    // Get the current user
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user || job.userId !== user._id) {
      throw new ConvexError("Unauthorized");
    }

    // Get all content for this job
    const content = await ctx.runQuery(api.archiveMutations.getJobContent, { jobId: args.jobId });
    
    // Generate CSV
    const csvHeader = [
      "platform",
      "content_type", 
      "title",
      "content",
      "url",
      "date_posted",
      "score",
      "parent_title",
      "word_count",
      "username"
    ].join(",");

    const csvRows: string[] = content.map((item: any) => [
      escapeCSV(item.platform),
      escapeCSV(item.contentType),
      escapeCSV(item.title || ""),
      escapeCSV(item.content),
      escapeCSV(item.url),
      escapeCSV(item.datePosted),
      item.score?.toString() || "",
      escapeCSV(item.parentTitle || ""),
      item.wordCount.toString(),
      escapeCSV(item.username)
    ].join(","));

    const csv: string = [csvHeader, ...csvRows].join("\n");
    
    return csv;
  },
});

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}