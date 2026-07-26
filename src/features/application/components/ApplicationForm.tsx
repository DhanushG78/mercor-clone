"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Job } from "@/types/job";
import { applicationSchema } from "../schemas/application";
import { Application } from "../types/application";
import { ResumeUpload } from "./ResumeUpload";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { applicationClient } from "../api/application.client";
import { toast } from "sonner";

interface ApplicationFormProps {
  job: Job;
  onSubmitSuccess?: () => void;
}

import { useState } from "react";

export function ApplicationForm({ job, onSubmitSuccess }: ApplicationFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const form = useForm<Application>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      linkedinUrl: "",
      portfolioUrl: "",
      coverLetter: "",
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: Application) => {
    try {
      let s3Result = null;

      // 1. Upload resume to S3 first if candidate selected a file
      if (selectedFile) {
        setIsUploadingFile(true);
        const uploadResponse = await applicationClient.uploadResumeFile(selectedFile);
        setIsUploadingFile(false);

        if (!uploadResponse.success) {
          toast.error(uploadResponse.message || "Failed to upload resume to S3. Please try again.");
          return;
        }

        s3Result = uploadResponse.data;
      }

      // 2. Submit candidate application with S3 metadata
      const response = await applicationClient.submitApplication({
        jobId: job.id,
        name: data.fullName,
        email: data.email,
        phone: data.phone,
        coverLetter: data.coverLetter || null,
        jobTitle: job.title,
        companyName: job.company?.name || null,
        linkedinUrl: data.linkedinUrl || null,
        portfolioUrl: data.portfolioUrl || null,
        resumeUrl: s3Result?.url || null,
        resumeKey: s3Result?.key || null,
        fileName: s3Result?.fileName || null,
        fileSize: s3Result?.fileSize || null,
        mimeType: s3Result?.mimeType || null,
      });

      if (!response.success) {
        console.error("[Application Form Submit Error]:", response.message);
        toast.error(response.message || "Submission failed. Please check your details and try again.");
        return;
      }

      toast.success("Your job application has been submitted successfully!");
      
      // Reset form controls
      form.reset();
      setSelectedFile(null);

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      setIsUploadingFile(false);
      console.error("[Application Form Submit Exception]:", err);
      toast.error("A network or system error occurred. Please try again later.");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Row 1: Full Name + Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-700 font-semibold">
                  Full Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="John Doe"
                    className="rounded-lg border-slate-200 focus-visible:ring-purple-500"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-700 font-semibold">
                  Email Address <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    className="rounded-lg border-slate-200 focus-visible:ring-purple-500"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>

        {/* Row 2: Phone (full width) */}
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-700 font-semibold">
                Phone Number <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="rounded-lg border-slate-200 focus-visible:ring-purple-500"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {/* Row 3: LinkedIn + Portfolio */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="linkedinUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-700 font-semibold">
                  LinkedIn URL{" "}
                  <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://linkedin.com/in/username"
                    className="rounded-lg border-slate-200 focus-visible:ring-purple-500"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="portfolioUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-700 font-semibold">
                  Portfolio URL{" "}
                  <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://myportfolio.com"
                    className="rounded-lg border-slate-200 focus-visible:ring-purple-500"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </div>

        {/* Row 4: Cover Letter */}
        <FormField
          control={form.control}
          name="coverLetter"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-700 font-semibold">
                Cover Letter <span className="text-slate-400 font-normal text-xs">(Optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Introduce yourself and tell us why you are a great fit for this role..."
                  className="min-h-[110px] rounded-lg border-slate-200 focus-visible:ring-purple-500 resize-y"
                  {...field}
                />
              </FormControl>
              <div className="flex justify-between items-center mt-1">
                <FormMessage className="text-xs" />
                <span className="text-xs text-slate-400 ml-auto">
                  {field.value?.length ?? 0} / 1000
                </span>
              </div>
            </FormItem>
          )}
        />

        {/* Resume Upload */}
        <ResumeUpload
          selectedFile={selectedFile}
          onFileSelect={setSelectedFile}
        />

        {/* Submit */}
        <div className="pt-1">
          <Button
            type="submit"
            disabled={isSubmitting || isUploadingFile}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
          >
            {isUploadingFile
              ? "Uploading Resume to S3..."
              : isSubmitting
              ? "Submitting Application..."
              : "Submit Application"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
