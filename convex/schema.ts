import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema defines your data model for the database.
// For more information, see https://docs.convex.dev/database/schema
export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
  }).index("by_clerkId", ["clerkId"]),
  
  archiveJobs: defineTable({
    userId: v.id("users"),
    username: v.string(),
    platforms: v.array(v.string()),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    totalItems: v.optional(v.number()),
    processedItems: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),
  
  archivedContent: defineTable({
    jobId: v.id("archiveJobs"),
    platform: v.string(),
    contentType: v.string(), // "post", "comment", "shortform"
    title: v.optional(v.string()),
    content: v.string(),
    url: v.string(),
    datePosted: v.string(),
    score: v.optional(v.number()),
    parentTitle: v.optional(v.string()),
    wordCount: v.number(),
    username: v.string(),
    originalId: v.string(),
  }).index("by_jobId", ["jobId"]),
});
