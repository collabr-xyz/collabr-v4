"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useActiveAccount } from "thirdweb/react";
import Image from 'next/image';

// Message type definition
interface Message {
  id: string;
  text: string;
  senderName: string;
  senderAddress: string;
  senderAvatar?: string;
  timestamp: any;
}

// Community type definition
interface Community {
  id: string;
  name: string;
  description: string;
  image: string;
  tags: string[];
  membershipLimit: number;
  nftContractAddress: string;
  nftPrice: number;
  creatorAddress: string;
  createdAt: string;
}

export default function CommunityRoom() {
  const params = useParams();
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch community details
  useEffect(() => {
    async function fetchCommunity() {
      try {
        const docRef = doc(db, "communities", communityId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const communityData = {
            id: docSnap.id,
            ...docSnap.data()
          } as Community;
          
          setCommunity(communityData);
          
          // Check if user is a member (this would need to be implemented based on your membership model)
          // For now, we'll simulate this check
          setIsMember(true);
          
          // Simulate online members count
          setOnlineMembers(Math.floor(Math.random() * 10) + 5);
        } else {
          setError("Community not found");
        }
      } catch (error) {
        console.error("Error fetching community:", error);
        setError("Failed to load community details. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    
    if (communityId) {
      fetchCommunity();
    }
  }, [communityId]);
  
  // Subscribe to messages
  useEffect(() => {
    if (!communityId) return;
    
    const messagesRef = collection(db, "communities", communityId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));
    
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messageList: Message[] = [];
      snapshot.forEach((doc) => {
        messageList.push({
          id: doc.id,
          ...doc.data()
        } as Message);
      });
      setMessages(messageList);
    });
    
    return () => unsubscribe();
  }, [communityId]);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !activeAccount || !communityId) return;
    
    try {
      const messagesRef = collection(db, "communities", communityId, "messages");
      await addDoc(messagesRef, {
        text: newMessage,
        senderName: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        senderAddress: activeAccount.address,
        senderAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
        timestamp: serverTimestamp()
      });
      
      setNewMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-2 w-2 bg-gray-300 rounded-full animate-pulse"></div>
        <div className="h-2 w-2 bg-gray-300 rounded-full animate-pulse mx-1"></div>
        <div className="h-2 w-2 bg-gray-300 rounded-full animate-pulse"></div>
      </div>
    );
  }
  
  if (error || !community) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-normal text-gray-800 mb-3">Error</h1>
        <p className="text-gray-600 mb-5 text-center max-w-md">{error || "Failed to load community"}</p>
        <Link href="/communities" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition">
          Back to Communities
        </Link>
      </div>
    );
  }
  
  if (!isMember) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-normal text-gray-800 mb-3">Access Restricted</h1>
        <p className="text-gray-600 mb-5 text-center max-w-md">You need to be a member to access this community room.</p>
        <Link href={`/communities/${communityId}`} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition">
          Join Community
        </Link>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal Header */}
      <header className="border-b border-gray-100 py-3 px-4 sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center">
          <Link href={`/communities/${communityId}`} className="text-gray-400 hover:text-gray-600 mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="text-base font-medium text-gray-800">{community.name}</h1>
          <span className="text-xs text-gray-400 ml-2">· {onlineMembers} online</span>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-3xl mx-auto w-full">
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm">No messages yet</p>
              </div>
            ) : (
              messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`flex ${message.senderAddress === activeAccount?.address ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] ${message.senderAddress === activeAccount?.address ? 'bg-gray-100 text-gray-800' : 'bg-white border border-gray-100 text-gray-800'} rounded-lg px-3 py-2`}>
                    {message.senderAddress !== activeAccount?.address && (
                      <div className="flex items-center space-x-1 mb-1">
                        <span className="text-xs font-medium text-gray-500">{message.senderName}</span>
                        <span className="text-xs text-gray-400">
                          {message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                    )}
                    <p className="text-sm break-words">{message.text}</p>
                    {message.senderAddress === activeAccount?.address && (
                      <div className="flex justify-end">
                        <span className="text-xs text-gray-400">
                          {message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        {/* Minimal Message input */}
        <div className="border-t border-gray-100 p-4">
          <form onSubmit={handleSendMessage} className="flex">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              className="flex-1 text-sm py-2 px-3 border border-gray-200 rounded-md focus:outline-none focus:border-gray-300 focus:ring-0"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="ml-2 px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
