"use client";

import { ConnectButton } from "thirdweb/react";
import { client } from "./client";
import Link from "next/link";
import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    try {
      // Here you would typically send the email to your backend
      // For now, we'll just simulate a successful submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsSubmitted(true);
      setEmail("");
    } catch (err) {
      setError("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-zinc-900 relative">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=3870&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Community Collaboration Background"
          fill
          priority
          className="object-cover opacity-50"
          sizes="100vw"
        />
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-2xl font-medium">Collabr</h1>
            {/* <p className="text-zinc-500 mt-1 text-sm">Web3 Communities Platform</p> */}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-zinc-700 hover:text-purple-600 transition">
              Documentation
            </Link>
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Collabr",
                url: "https://collabr.xyz",
              }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6">
              Collabr
              <span className="text-[#008CFF] ml-2">Communities</span>
            </h2>
            <p className="text-zinc-600 text-xl max-w-2xl mx-auto">
              Connect with like-minded individuals in the Web3 space and collaborate on projects that matter.
            </p>
          </div>
          
          <Link 
            href="/communities" 
            className="bg-[#008CFF] hover:bg-[#0070CC] text-white px-8 py-3 rounded-lg transition text-lg font-medium mb-16"
          >
            Explore Communities
          </Link>

          {/* Host Application Form */}
          <div className="w-full max-w-2xl mx-auto mt-16 bg-white/90 backdrop-blur-sm p-8 rounded-xl border border-gray-100 shadow-lg">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">Become a Host</h3>
              <p className="text-zinc-600">
                Apply to become a community host and start building your own Web3 community.
              </p>
            </div>

            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[#008CFF] focus:border-[#008CFF] outline-none transition"
                  />
                </div>
                
                {error && <p className="text-red-500 text-sm">{error}</p>}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#008CFF] hover:bg-[#0070CC] text-white px-4 py-2 rounded-md transition font-medium disabled:opacity-70"
                >
                  {isSubmitting ? "Submitting..." : "Apply to Host"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-xl font-medium mb-2">Application Received!</h4>
                <p className="text-zinc-600">
                  Thank you for your interest. We'll review your application and get back to you soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="border border-zinc-100 rounded-lg p-6 hover:shadow-md transition">
      <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-zinc-600 text-sm">{description}</p>
    </div>
  );
}
