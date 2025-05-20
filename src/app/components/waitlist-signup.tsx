"use client"

import { useState, useEffect } from "react"
//import { getWaitlistCount } from "../actions/waitlist"
import { XIcon } from "./icons/x-icon"
import { InstagramIcon } from "./icons/instagram-icon"
import { DiscordIcon } from "./icons/discord-icon"
import { FacebookIcon } from "./icons/facebook-icon"
import { LinkedInIcon } from "./icons/linkedin-icon"
import { TelegramIcon } from "./icons/telegram-icon"
import { Avatar } from "./avatar"
import { SocialIcon } from "./social-icon"
import { WaitlistForm } from "./waitlist-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function WaitlistSignup() {
  const [waitlistCount, setWaitlistCount] = useState(0)

  // useEffect(() => {
  //   getWaitlistCount().then((count) => setWaitlistCount(count + 100))
  // }, [])

  const handleSuccess = (count: number) => {
    setWaitlistCount(count + 100)
  }

  return (
    <div className="w-full max-w-xl mx-auto p-8 flex flex-col justify-between min-h-screen">
      <div className="flex-1 flex flex-col justify-center items-center text-center">
        
        <div>
          <h2 className="text-3xl sm:text-4xl font-medium mb-4 text-white tracking-tight">
            Join The Best Onchain Creators Community 
          </h2>
        </div>

        <div>
          <p className="text-base sm:text-lg mb-6 text-gray-400 max-w-md">
            Get invested by your fans and embark on a journey to build the onchain adventure together.
            <br />
            <Link href="/communities" className="underline text-white hover:text-gray-200 transition-colors">
              Start exploring
            </Link>
            {" · "}
            <Link href="https://www.notion.so/collabr/Collabr-1f96bac1032d80e0bdafdf9cc878a0f8?pvs=4" 
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-white hover:text-gray-200 transition-colors">
              Learn More
            </Link>
          </p>
        </div>
        <div className="w-full">
          <WaitlistForm onSuccess={handleSuccess} />
        </div>
        
        <div>
          <div className="flex items-center justify-center mt-8">
            <div className="flex -space-x-2 mr-4">
              <Avatar initials="JD" index={0} imageUrl="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format" />
              <Avatar initials="AS" index={1} imageUrl="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=150&auto=format" />
              <Avatar initials="MK" index={2} imageUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format" />
            </div>
            <p className="text-white font-semibold">100+ creators on the list</p>
          </div>
        </div>

        {/* <div className="mt-4">
          <Button 
            variant="ghost" 
            className="text-gray-300 hover:text-white hover:bg-white/10 border border-gray-700 hover:border-gray-500 rounded-xl transition-all duration-300"
          >
            <Link href="/about">Learn More</Link>
          </Button>
        </div> */}
      </div>

      <div className="pt-8 flex justify-center space-x-6">
        <SocialIcon
          href="https://x.com/collabrxyz"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X (formerly Twitter)"
          icon={<XIcon className="w-6 h-6" />}
        />
        <SocialIcon
          href="https://t.me/wfyeung"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram"
          icon={<TelegramIcon className="w-6 h-6" />}
        />
        {/* <SocialIcon
          href="https://instagram.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          icon={<InstagramIcon className="w-6 h-6" />}
        />
        <SocialIcon
          href="https://discord.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Discord"
          icon={<DiscordIcon className="w-6 h-6" />}
        />
        <SocialIcon
          href="https://facebook.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook"
          icon={<FacebookIcon className="w-6 h-6" />}
        />
        <SocialIcon
          href="https://linkedin.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn"
          icon={<LinkedInIcon className="w-6 h-6" />}
        /> */}
      </div>
    </div>
  )
}
