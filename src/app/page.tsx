"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import { WaitlistSignup } from "./components/waitlist-signup"
import { Toaster } from "@/components/ui/toaster"

const backgroundStyle = `
  .bg-pattern {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      linear-gradient(to right, rgba(255,255,255,0.01) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.01) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 1;
  }

  .content {
    position: relative;
    z-index: 2;
  }
`

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setIsSubmitting(true);
  //   setError("");
    
  //   try {
  //     // Simulate submission
  //     await new Promise(resolve => setTimeout(resolve, 1000));
      
  //     // Send notification email
  //     await fetch('/api/send-notification', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({ email }),
  //     });
      
  //     setIsSubmitted(true);
  //     setEmail("");
  //   } catch (err) {
  //     setError("Failed to submit. Please try again.");
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  return (
    // <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative">
    //   <div className="container mx-auto px-4 max-w-2xl relative z-10 flex flex-col items-center">
    //     <div className="flex flex-col items-center justify-center py-16 w-full">
    //       <div className="text-center mb-8">
    //         <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-gray-200">
    //           Get Invested By Your Fans
    //         </h1>
    //         <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10">
    //           Build a community that shares in your success. Let your fans invest in your creative journey and share the profits you make in the future.
    //         </p>
    //       </div>
          
    //       {!isSubmitted ? (
    //         <form onSubmit={handleSubmit} className="w-full max-w-md">
    //           <div className="flex flex-col sm:flex-row w-full gap-2 mb-8">
    //             <input
    //               type="email"
    //               value={email}
    //               onChange={(e) => setEmail(e.target.value)}
    //               placeholder="Enter your email"
    //               required
    //               className="flex-grow px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-[#008CFF] focus:border-[#008CFF] outline-none transition text-white"
    //             />
    //             <button
    //               type="submit"
    //               disabled={isSubmitting}
    //               className="px-6 py-3 bg-zinc-100 text-black font-medium rounded-lg hover:bg-white transition disabled:opacity-70 whitespace-nowrap"
    //             >
    //               {isSubmitting ? "Processing..." : "Get Notified"}
    //             </button>
    //           </div>
              
    //           {error && (
    //             <div className="bg-red-900/50 border border-red-800 p-4 rounded-lg mb-6">
    //               <p className="text-red-200 text-sm">{error}</p>
    //             </div>
    //           )}
    //         </form>
    //       ) : (
    //         <div className="text-center py-6 mb-8">
    //           <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900 text-green-400 mb-4">
    //             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    //               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    //             </svg>
    //           </div>
    //           <h4 className="text-xl font-bold mb-2 text-gray-200">You're on the list!</h4>
    //           <p className="text-gray-400 mb-4 text-sm max-w-md mx-auto">
    //             Thank you for your interest. We'll notify you when we launch our creator investment platform.
    //           </p>
    //         </div>
    //       )}
          
    //       {/* Waitlist indicator */}
    //       <div className="flex items-center justify-center mt-4 mb-12">
    //         <div className="flex -space-x-2 mr-3">
    //           <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-medium text-white">JD</div>
    //           <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-medium text-white">AS</div>
    //           <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-medium text-white">MK</div>
    //         </div>
    //         <span className="text-gray-400 text-sm">100+ people on the waitlist</span>
    //       </div>
    //     </div>
        
    //     {/* Social links */}
    //     <div className="flex gap-6 mb-12">
    //       <a href="#" aria-label="Twitter" className="text-gray-500 hover:text-gray-300">
    //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    //           <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
    //         </svg>
    //       </a>
    //       <a href="#" aria-label="Instagram" className="text-gray-500 hover:text-gray-300">
    //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    //           <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    //           <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    //           <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    //         </svg>
    //       </a>
    //       <a href="#" aria-label="Discord" className="text-gray-500 hover:text-gray-300">
    //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    //           <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.385-.403.8-.548 1.17a16.089 16.089 0 0 0-4.85 0 11.142 11.142 0 0 0-.554-1.17.077.077 0 0 0-.079-.036 18.568 18.568 0 0 0-4.885 1.491.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 18.631 18.631 0 0 0 5.636 2.852.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 12.306 12.306 0 0 1-1.758-.838.077.077 0 0 1-.008-.128 9.794 9.794 0 0 0 .357-.252.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.086.238.168.357.252a.077.077 0 0 1-.006.127 11.526 11.526 0 0 1-1.758.839.077.077 0 0 0-.041.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029c1.94-.61 3.861-1.532 5.636-2.853a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"></path>
    //         </svg>
    //       </a>
    //       <a href="#" aria-label="Facebook" className="text-gray-500 hover:text-gray-300">
    //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    //           <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
    //         </svg>
    //       </a>
    //       <a href="#" aria-label="LinkedIn" className="text-gray-500 hover:text-gray-300">
    //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    //           <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
    //           <rect x="2" y="9" width="4" height="12"></rect>
    //           <circle cx="4" cy="4" r="2"></circle>
    //         </svg>
    //       </a>
    //     </div>
    //   </div>
    // </main>
    <main
    className="min-h-screen flex items-center justify-center"
    style={{
      background: "#0f0f0f",
    }}
  >
    <style jsx global>
      {backgroundStyle}
    </style>
    <div className="bg-pattern"></div>
    <div className="content w-full">
      <WaitlistSignup />
    </div>
    <Toaster
      // toastOptions={{
      //   style: {
      //     background: "rgb(23 23 23)",
      //     color: "white",
      //     border: "1px solid rgb(63 63 70)",
      //   },
      //   className: "rounded-xl",
      //   duration: 5000,
      // }}
    />
  </main>
  );
}
