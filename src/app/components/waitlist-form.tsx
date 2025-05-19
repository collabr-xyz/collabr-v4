'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"

interface WaitlistFormProps {
  onSuccess: (count: number) => void;
}

export function WaitlistForm({ onSuccess }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !email.includes('@')) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
        duration: 5000,
      })
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success!",
          description: "Our team will reach out to you soon!",
          duration: 5000,
        })
        onSuccess(0) // You can adjust this if you have a count to return
        setEmail('')
      } else {
        throw new Error(data.error || 'Something went wrong')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to join waitlist",
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="w-full space-y-4 mb-8" onSubmit={handleSubmit}>
      <div className="flex overflow-hidden rounded-xl bg-white/5 p-1 ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-blue-500">
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="email-error"
          className="w-full border-0 bg-transparent text-white placeholder:text-gray-400 focus:ring-0 focus:border-transparent focus-visible:border-transparent focus:outline-none active:ring-0 active:outline-none focus-visible:ring-0 focus-visible:outline-none active:border-transparent focus-visible:ring-offset-0"
        />
        <Button 
          type="submit" 
          variant="outline"
          disabled={isSubmitting}
          className="bg-white hover:bg-gray-800 text-black font-semibold px-4 rounded-xl transition-all duration-300 ease-in-out focus:outline-none w-[150px]"
          style={{ color: 'black' }}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              sending...
            </>
          ) : (
            "Become a member"
          )}
        </Button>
      </div>
    </form>
  )
}
