"use client";

import { ConnectButton } from "thirdweb/react";
import { client } from "./client";
import Link from "next/link";
import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const [formData, setFormData] = useState({
    email: "",
    platform: "",
    socialHandle: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const sendNotificationEmail = async (data: { email: string; platform: string; socialHandle: string }) => {
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to send notification');
      }

      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    try {
      // Here you would typically send the form data to your backend
      // For now, we'll just simulate a successful submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send notification email
      await sendNotificationEmail(formData);
      
      setIsSubmitted(true);
      setFormData({
        email: "",
        platform: "",
        socialHandle: "",
      });
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
          src="/media/background.png"
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
            <Link href="https://collabr.gitbook.io/collabr/" className="text-zinc-700 hover:text-purple-600 transition">
              Documentation
            </Link>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6">
              Support the best
              <span className="text-[#008CFF] ml-2">communities</span>
            </h2>
            <p className="text-zinc-800 text-xl max-w-2xl mx-auto">
              Grow your community and earn tokens for your contributions
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
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#008CFF] focus:border-[#008CFF] outline-none transition"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="platform" className="block text-sm font-medium text-gray-700">
                    Which platform are you most active on?
                  </label>
                  <select
                    id="platform"
                    name="platform"
                    value={formData.platform}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#008CFF] focus:border-[#008CFF] outline-none transition bg-white"
                  >
                    <option value="" disabled>Select a platform</option>
                    <option value="X (Twitter)">X (Twitter)</option>
                    <option value="Discord">Twitch</option>
                    <option value="Discord">Youtube</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Youtube">Farcaster</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="socialHandle" className="block text-sm font-medium text-gray-700">
                    What is your social media handle for the platform you chose?
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                      @
                    </span>
                    <input
                      type="text"
                      id="socialHandle"
                      name="socialHandle"
                      value={formData.socialHandle}
                      onChange={handleChange}
                      placeholder="username"
                      required
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#008CFF] focus:border-[#008CFF] outline-none transition"
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    id="terms"
                    required
                    className="h-4 w-4 text-[#008CFF] focus:ring-[#008CFF] border-gray-300 rounded"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-700">
                    I agree to the <a href="#" className="text-[#008CFF] hover:underline">Terms of Service</a> and <a href="#" className="text-[#008CFF] hover:underline">Privacy Policy</a>
                  </label>
                </div>
                
                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#008CFF] hover:bg-[#0070CC] text-white px-6 py-3 rounded-md transition font-medium disabled:opacity-70 flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Apply to Host"
                  )}
                </button>
              </form>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-2xl font-bold mb-3">Application Received!</h4>
                <p className="text-zinc-600 mb-6 max-w-md mx-auto">
                  Thank you for your interest in becoming a Collabr host. Our team will reach out to you within 24 hours.
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
