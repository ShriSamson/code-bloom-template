import { SignInButton } from "@clerk/clerk-react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { Download, Archive, FileText, Clock, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

const formSchema = z.object({
  username: z.string().min(1, "Username is required"),
  platforms: z.array(z.enum(["ea-forum", "lesswrong"])).min(1, "Select at least one platform"),
});

const jobsQueryOptions = convexQuery(api.archive.getUserJobs, {});

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) =>
    await queryClient.ensureQueryData(jobsQueryOptions),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="text-center">
      <div className="not-prose flex justify-center mb-4">
        <Archive className="w-16 h-16 text-primary" />
      </div>
      <h1>EA Forum & LessWrong Archiver</h1>
      <p className="text-lg opacity-80 mb-8">
        Download posts, shortforms, and comments for text analysis
      </p>

      <Unauthenticated>
        <p>Sign in to start downloading content.</p>
        <div className="not-prose mt-4">
          <SignInButton mode="modal">
            <button className="btn btn-primary btn-lg">Get Started</button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="space-y-8">
          <ArchiveForm />
          <JobsList />
        </div>
      </Authenticated>
    </div>
  );
}

function ArchiveForm() {
  const [isLoading, setIsLoading] = useState(false);
  const fetchContent = useMutation(api.archive.fetchUserContent);
  
  const form = useForm({
    defaultValues: {
      username: "",
      platforms: ["ea-forum", "lesswrong"] as const,
    },
    validators: {
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      setIsLoading(true);
      try {
        const jobId = await fetchContent({
          username: value.username,
          platforms: value.platforms,
        });
        form.reset();
      } catch (error) {
        console.error("Failed to fetch content:", error);
      } finally {
        setIsLoading(false);
      }
    },
  });

  return (
    <div className="not-prose max-w-md mx-auto">
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center mb-4">Download User Content</h2>
          
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            {/* Username Input */}
            <form.Field name="username">
              {(field) => (
                <div className="form-control mb-4">
                  <label className="label" htmlFor={field.name}>
                    <span className="label-text">Username</span>
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="Enter username or slug"
                  />
                  {!field.state.meta.isValid && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {field.state.meta.errors.map(e => e.message).join(", ")}
                      </span>
                    </label>
                  )}
                </div>
              )}
            </form.Field>

            {/* Platform Selection */}
            <form.Field name="platforms">
              {(field) => (
                <div className="form-control mb-6">
                  <label className="label">
                    <span className="label-text">Platforms</span>
                  </label>
                  <div className="flex flex-col gap-2">
                    <label className="label cursor-pointer justify-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary"
                        checked={field.state.value.includes("ea-forum")}
                        onChange={(e) => {
                          const current = field.state.value;
                          if (e.target.checked) {
                            field.handleChange([...current, "ea-forum"]);
                          } else {
                            field.handleChange(current.filter(p => p !== "ea-forum"));
                          }
                        }}
                      />
                      <span className="label-text">EA Forum</span>
                    </label>
                    <label className="label cursor-pointer justify-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary"
                        checked={field.state.value.includes("lesswrong")}
                        onChange={(e) => {
                          const current = field.state.value;
                          if (e.target.checked) {
                            field.handleChange([...current, "lesswrong"]);
                          } else {
                            field.handleChange(current.filter(p => p !== "lesswrong"));
                          }
                        }}
                      />
                      <span className="label-text">LessWrong</span>
                    </label>
                  </div>
                  {!field.state.meta.isValid && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {field.state.meta.errors.map(e => e.message).join(", ")}
                      </span>
                    </label>
                  )}
                </div>
              )}
            </form.Field>

            {/* Submit Button */}
            <div className="card-actions justify-center">
              <button
                type="submit"
                disabled={!form.state.canSubmit || isLoading}
                className="btn btn-primary btn-wide"
              >
                {isLoading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Fetching...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Content
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function JobsList() {
  const { data: jobs } = useSuspenseQuery(jobsQueryOptions);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const exportCsv = useMutation(api.archive.exportToCsv);

  const exportToCsv = async (jobId: string) => {
    setIsExporting(jobId);
    try {
      const csv = await exportCsv({ jobId });
      
      // Create and download CSV file
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `archive-${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(null);
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="not-prose max-w-2xl mx-auto">
        <div className="text-center p-8 bg-base-200 rounded-lg">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="opacity-70">No archive jobs yet. Start by downloading some content!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Your Archive Jobs</h2>
      
      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job._id} className="card bg-base-200 shadow">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="card-title">
                    @{job.username}
                    <div className="badge badge-secondary ml-2">
                      {job.platforms.join(", ")}
                    </div>
                  </h3>
                  <p className="text-sm opacity-70">
                    Started {new Date(job._creationTime).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {job.status === "pending" && (
                      <>
                        <Clock className="w-4 h-4 text-info" />
                        <span className="text-info">Pending</span>
                      </>
                    )}
                    {job.status === "running" && (
                      <>
                        <span className="loading loading-spinner loading-sm text-warning"></span>
                        <span className="text-warning">Running</span>
                      </>
                    )}
                    {job.status === "completed" && (
                      <>
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-success">Completed</span>
                      </>
                    )}
                    {job.status === "failed" && (
                      <>
                        <XCircle className="w-4 h-4 text-error" />
                        <span className="text-error">Failed</span>
                      </>
                    )}
                  </div>

                  {/* Progress */}
                  {job.status === "completed" && job.processedItems && (
                    <div className="text-sm opacity-70">
                      {job.processedItems} items
                    </div>
                  )}

                  {/* Export Button */}
                  {job.status === "completed" && (
                    <button
                      onClick={() => exportToCsv(job._id)}
                      disabled={isExporting === job._id}
                      className="btn btn-sm btn-primary"
                    >
                      {isExporting === job._id ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          CSV
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {job.status === "failed" && job.errorMessage && (
                <div className="alert alert-error mt-4">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{job.errorMessage}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
