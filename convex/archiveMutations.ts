import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Mutation to start a new archive job
export const fetchUserContent = mutation({
  args: {
    username: v.string(),
    platforms: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    
    if (!user) {
      throw new ConvexError("User not found");
    }

    // Create a new archive job
    const jobId = await ctx.db.insert("archiveJobs", {
      userId: user._id,
      username: args.username,
      platforms: args.platforms,
      status: "pending",
    });

    // Schedule the actual fetching work
    await ctx.scheduler.runAfter(0, internal.archiveActions.fetchContentWorker, { jobId });

    return jobId;
  },
});

export const updateJobStatus = mutation({
  args: {
    jobId: v.id("archiveJobs"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    processedItems: v.optional(v.number()),
    totalItems: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = { status: args.status };
    
    if (args.processedItems !== undefined) updates.processedItems = args.processedItems;
    if (args.totalItems !== undefined) updates.totalItems = args.totalItems;
    if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;
    if (args.status === "completed") updates.completedAt = Date.now();

    await ctx.db.patch(args.jobId, updates);
  },
});

export const getJob = query({
  args: { jobId: v.id("archiveJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const saveContent = mutation({
  args: {
    jobId: v.id("archiveJobs"),
    content: v.array(v.object({
      platform: v.string(),
      contentType: v.string(),
      title: v.optional(v.string()),
      content: v.string(),
      url: v.string(),
      datePosted: v.string(),
      score: v.optional(v.number()),
      parentTitle: v.optional(v.string()),
      wordCount: v.number(),
      username: v.string(),
      originalId: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const item of args.content) {
      await ctx.db.insert("archivedContent", {
        jobId: args.jobId,
        ...item,
      });
    }
  },
});

export const getUserJobs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    
    if (!user) {
      throw new ConvexError("User not found");
    }

    return await ctx.db
      .query("archiveJobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getJobContent = query({
  args: { jobId: v.id("archiveJobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("archivedContent")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});