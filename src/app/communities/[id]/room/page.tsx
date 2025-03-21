"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useActiveAccount } from "thirdweb/react";
import Link from 'next/link';

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

interface Member {
  id: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  joinedAt: string;
}

interface Message {
  id: string;
  text: string;
  senderAddress: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp: any;
  isCreator?: boolean;
  createdAt?: string;
  fallback?: boolean;
  replyTo?: string;
  replyToSender?: string;
  replyToText?: string;
}

export default function ChatRoom() {
  const params = useParams();
  const router = useRouter(); 
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<'member' | 'nonmember' | 'loading'>('loading');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Add loading timeout to prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log("Loading timeout reached - forcing load completion");
        setLoading(false);
        if (!error) {
          setError("The chat room is taking too long to load. Please refresh the page.");
        }
      }
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(loadingTimeout);
  }, [loading, error]);
  
  // Check if Firestore is properly initialized
  useEffect(() => {
    try {
      // Simple test query to see if Firestore is working
      const testRef = doc(db, "_test", "test");
      getDoc(testRef).then(() => {
        console.log("Firestore connection successful");
      }).catch(err => {
        console.error("Firestore connection error:", err);
        setError("Error connecting to the chat database. Please try again later.");
      });
    } catch (err) {
      console.error("Firestore initialization error:", err);
      setError("Chat service is currently unavailable. Please try again later.");
    }
  }, []);
  
  // Check if user has completed a profile for this community
  useEffect(() => {
    if (!activeAccount?.address || !communityId || userStatus !== 'member' || profileChecked) {
      return;
    }
    
    async function checkProfile() {
      try {
        console.log("Checking profile completion for address:", activeAccount?.address);
        
        // Check if user has a profile for this community
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount?.address || "");
        const profileSnapshot = await getDoc(profileRef);
        
        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data();
          console.log("Profile found:", profileData);
          
          // Explicitly check the isProfileComplete field
          if (profileData.isProfileComplete === true) {
            console.log("Profile is complete, user can access chat");
            setProfileChecked(true);
            return; // Exit early if profile is complete
          } else {
            console.log("Profile exists but is not complete:", profileData.isProfileComplete);
          }
        } else {
          console.log("No profile found for user");
        }
        
        // If we reach here, the profile either doesn't exist or is not complete
        console.log("Redirecting to profile setup page");
        router.push(`/communities/${communityId}/profile/setup`);
        
        setProfileChecked(true);
      } catch (err) {
        console.error("Error checking user profile:", err);
        // Don't block the user from using the chat if profile check fails
        setProfileChecked(true);
      }
    }
    
    // Add a small delay to ensure database operations have completed
    const timerId = setTimeout(() => {
      checkProfile();
    }, 500);
    
    return () => clearTimeout(timerId);
  }, [activeAccount?.address, communityId, userStatus, profileChecked, router]);
  
  // Automatically redirect if user clicks outside the modal
  useEffect(() => {
    if (showProfileModal) {
      // Prevent scrolling the background content
      document.body.style.overflow = 'hidden';
      
      // Add event listener for ESC key to maintain focus on modal
      const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
      };
      
      window.addEventListener('keydown', handleEscKey);
      
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showProfileModal]);
  
  // Handle profile redirection
  const handleProfileSetup = () => {
    router.push(`/communities/${communityId}/profile/setup`);
  };

  // Fetch community data
  useEffect(() => {
    async function fetchCommunity() {
      try {
        const communityDoc = await getDoc(doc(db, "communities", communityId));
        if (communityDoc.exists()) {
          setCommunity({ id: communityDoc.id, ...communityDoc.data() } as Community);
        } else {
          setError("Community not found");
        }
      } catch (err) {
        console.error("Error fetching community:", err);
        setError("Failed to load community");
      }
    }
    fetchCommunity();
  }, [communityId]);
  
  // Fetch members and set user status
  useEffect(() => {
    async function fetchMembers() {
      try {
        console.log("Fetching members for community:", communityId);
        const q = query(collection(db, "members"), where("communityId", "==", communityId));
        const querySnapshot = await getDocs(q);
        const membersData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Member[];
        
        console.log(`Found ${membersData.length} members in the community`);
        
        // Check for profiles and update member display names and avatars
        const updatedMembersData = [...membersData];
        
        // Only try to update if there are members
        if (updatedMembersData.length > 0) {
          try {
            // Get community profiles for these members
            for (let i = 0; i < updatedMembersData.length; i++) {
              const member = updatedMembersData[i];
              const profileRef = doc(db, "communities", communityId, "profiles", member.walletAddress);
              const profileSnapshot = await getDoc(profileRef);
              
              if (profileSnapshot.exists()) {
                const profileData = profileSnapshot.data();
                // Update member display name and avatar if they exist in profile
                if (profileData.displayName) {
                  updatedMembersData[i].displayName = profileData.displayName;
                }
                if (profileData.avatar) {
                  updatedMembersData[i].avatarUrl = profileData.avatar;
                }
              }
            }
          } catch (err) {
            console.error("Error fetching member profiles:", err);
            // Continue with base member data if profile fetch fails
          }
        }
        
        setMembers(updatedMembersData);
        
        // Check if current user is a member
        if (activeAccount?.address) {
          console.log("Current user wallet:", activeAccount.address);
          
          const isMember = updatedMembersData.some(
            member => member.walletAddress.toLowerCase() === activeAccount.address.toLowerCase()
          );
          
          const isCreator = community?.creatorAddress?.toLowerCase() === activeAccount.address.toLowerCase();
          console.log("Membership check - Is member:", isMember, "Is creator:", isCreator);
          
          // Also check if the user is the creator of the community
          if (isMember) {
            console.log("Setting user status to 'member' (as regular member)");
            setUserStatus('member');
          } else if (isCreator) {
            console.log("Setting user status to 'member' (as creator)");
            setUserStatus('member'); // Treat creators as members
            
            // Add creator to members list if not already there
            if (!updatedMembersData.some(m => m.walletAddress.toLowerCase() === activeAccount.address.toLowerCase())) {
              console.log("Adding creator to members list");
              
              // Check if creator has a profile
              let creatorDisplayName = 'Creator';
              let creatorAvatarUrl = undefined;
              
              try {
                const creatorProfileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
                const creatorProfileSnapshot = await getDoc(creatorProfileRef);
                
                if (creatorProfileSnapshot.exists()) {
                  const profileData = creatorProfileSnapshot.data();
                  if (profileData.displayName) {
                    creatorDisplayName = profileData.displayName;
                  }
                  if (profileData.avatar) {
                    creatorAvatarUrl = profileData.avatar;
                  }
                }
              } catch (err) {
                console.error("Error fetching creator profile:", err);
                // Continue with default creator display name
              }
              
              const creatorMember: Member = {
                id: 'creator',
                walletAddress: activeAccount.address,
                displayName: creatorDisplayName,
                avatarUrl: creatorAvatarUrl,
                joinedAt: community?.createdAt || new Date().toISOString()
              };
              setMembers([...updatedMembersData, creatorMember]);
            }
          } else {
            console.log("Setting user status to 'nonmember'");
            setUserStatus('nonmember');
          }
        } else {
          console.log("No active account, can't determine membership");
          setUserStatus('nonmember');
        }
      } catch (err) {
        console.error("Error fetching members:", err);
        setUserStatus('nonmember');
      } finally {
        // Always complete loading after fetching members, regardless of status
        setLoading(false);
      }
    }
    
    // Start fetching members once we have the community data
    if (community) {
      fetchMembers();
    } else if (error) {
      // If there's an error with community data, don't block the loading state
      setLoading(false);
    }
  }, [communityId, activeAccount?.address, community, error]);
  
  // Subscribe to messages
  useEffect(() => {
    // Don't wait for member status to be confirmed, just check if we're definitely not a member
    if (userStatus === 'nonmember') {
      console.log('Not subscribing to messages - user is definitely not a member');
      return;
    }
    
    console.log('Setting up message subscription for community:', communityId);
    let unsubscribe: () => void;
    let hasUnsubscribed = false;
    
    try {
      // First, create a basic query without the orderBy clause
      const q = query(
        collection(db, "messages"),
        where("communityId", "==", communityId)
      );
      
      // Add a timeout to abort if the subscription takes too long to initialize
      const subscriptionTimeout = setTimeout(() => {
        console.log("Message subscription timeout reached");
        if (!hasUnsubscribed && unsubscribe) {
          unsubscribe();
          hasUnsubscribed = true;
        }
      }, 5000); // 5 second timeout
      
      unsubscribe = onSnapshot(q, (querySnapshot) => {
        clearTimeout(subscriptionTimeout);
        
        try {
          console.log(`Received ${querySnapshot.docs.length} messages from Firestore`);
          
          if (querySnapshot.metadata.fromCache) {
            console.log("Warning: Message data came from cache");
          }
          
          // Sort messages by timestamp client-side to avoid composite index requirements
          const messagesData = querySnapshot.docs.map(doc => {
            try {
              const data = doc.data();
              return {
                id: doc.id,
                ...data
              } as Message;
            } catch (err) {
              console.error("Error processing message doc:", doc.id, err);
              return null;
            }
          }).filter(Boolean) as Message[];
          
          // Sort by timestamp
          const sortedMessages = messagesData.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.timestamp?.toMillis() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
          });
          
          setMessages(sortedMessages);
          setTimeout(() => scrollToBottom(), 100);
          
          // Messages loaded successfully - we can complete the loading state
          setLoading(false);
        } catch (err) {
          console.error("Error processing messages:", err);
          setError("Error loading messages. Please refresh the page.");
          setLoading(false);
        }
      }, (error) => {
        clearTimeout(subscriptionTimeout);
        console.error("Error fetching messages:", error);
        setError(`Failed to load messages: ${error.message}`);
        setLoading(false);
      });
      
      hasUnsubscribed = false;
    } catch (err) {
      console.error("Error setting up message listener:", err);
      setError("Could not connect to chat. Please refresh the page.");
      setLoading(false);
    }
    
    return () => {
      console.log('Unsubscribing from message listener');
      if (unsubscribe && !hasUnsubscribed) {
        unsubscribe();
        hasUnsubscribed = true;
      }
    };
  }, [communityId, userStatus]);
  
  // Scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  // Handle starting a reply to a message
  const handleStartReply = (message: Message) => {
    setReplyingTo(message);
    // Focus the input field
    const inputField = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (inputField) {
      setTimeout(() => inputField.focus(), 50);
    }
  };
  
  // Handle canceling a reply
  const handleCancelReply = () => {
    setReplyingTo(null);
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeAccount?.address || userStatus !== 'member') return;
    
    setMessageError(null);
    setSendingMessage(true);
    const messageText = newMessage; // Store message for retry
    
    try {
      // Find member info for the sender
      const senderMember = members.find(
        member => member.walletAddress.toLowerCase() === activeAccount.address.toLowerCase()
      );
      
      // Check if sender is the creator
      const isCreator = community?.creatorAddress?.toLowerCase() === activeAccount.address.toLowerCase();
      
      // Get profile information if available
      let senderName = senderMember?.displayName || (isCreator ? 'Creator' : activeAccount.address.substring(0, 6) + '...');
      let senderAvatar = senderMember?.avatarUrl;
      
      // Try to get the profile for more accurate information
      try {
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
        const profileSnapshot = await getDoc(profileRef);
        
        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data();
          if (profileData.displayName) {
            senderName = profileData.displayName;
          }
          if (profileData.avatar) {
            senderAvatar = profileData.avatar;
          }
        }
      } catch (err) {
        console.error("Error getting sender profile:", err);
        // Continue with member info if profile fetch fails
      }
      
      // Create message with simplified data structure
      const messageData: Record<string, any> = {
        text: messageText,
        senderAddress: activeAccount.address,
        senderName: senderName,
        communityId,
        timestamp: Timestamp.now(),
        isCreator, // Add this flag to identify creator messages
        createdAt: new Date().toISOString() // Add a string date for backup sorting
      };
      
      // Only add senderAvatar if it exists to avoid undefined values
      if (senderAvatar) {
        messageData.senderAvatar = senderAvatar;
      }
      
      // Add reply information if replying to a message
      if (replyingTo) {
        messageData.replyTo = replyingTo.id;
        messageData.replyToSender = replyingTo.senderName || replyingTo.senderAddress.substring(0, 6) + '...';
        // Truncate the reply text if it's too long
        messageData.replyToText = replyingTo.text.length > 50 
          ? replyingTo.text.substring(0, 50) + '...' 
          : replyingTo.text;
      }
      
      console.log("Sending message:", messageData);
      
      // Try primary method
      try {
        await addDoc(collection(db, "messages"), messageData);
        console.log("Message sent successfully");
        setNewMessage('');
        // Clear reply state after sending
        setReplyingTo(null);
      } catch (error) {
        const primaryError = error as Error;
        console.error("Primary message send failed:", primaryError);
        
        // Try fallback method - without timestamp field (which could cause issues)
        try {
          const fallbackData: Record<string, any> = {
            ...messageData,
            timestamp: null,
            fallback: true
          };
          
          // Remove any fields that might be undefined
          Object.keys(fallbackData).forEach(key => {
            if (fallbackData[key] === undefined) {
              delete fallbackData[key];
            }
          });
          
          await addDoc(collection(db, "messages"), fallbackData);
          console.log("Message sent via fallback");
          setNewMessage('');
        } catch (error) {
          const fallbackError = error as Error;
          console.error("Fallback message send failed:", fallbackError);
          throw new Error(`Message send failed: ${primaryError.message}. Fallback also failed: ${fallbackError.message}`);
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error("Error sending message:", err);
      setMessageError(`Failed to send message: ${err.message || "Unknown error"}. Please try again.`);
      // Keep the message text for retry
    } finally {
      setSendingMessage(false);
    }
  };
  
  if (error) {
    return (
      <main className="min-h-screen bg-white text-zinc-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-red-50 p-4 rounded-md border border-red-200 text-red-700 mb-4">
            <h2 className="text-lg font-medium mb-2">Error</h2>
            <p>{error}</p>
          </div>
          <Link href="/communities" className="text-[#008CFF] hover:underline">
            ← Back to Communities
          </Link>
        </div>
      </main>
    );
  }
  
  if (loading) {
    return (
      <div className="flex h-screen bg-white text-zinc-900">
        {/* Left sidebar skeleton */}
        <div className="w-64 bg-gray-50 p-4 flex flex-col border-r border-gray-200">
          <div className="h-6 bg-gray-200 rounded-md w-2/3 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded-md w-1/3 mb-6 animate-pulse"></div>
          
          <div className="h-3 bg-gray-200 rounded-md w-1/4 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded-md w-full mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded-md w-3/4 mb-6 animate-pulse"></div>
          
          <div className="h-3 bg-gray-200 rounded-md w-1/4 mb-2 animate-pulse"></div>
          <div className="flex flex-wrap gap-1 mb-6">
            <div className="h-6 bg-gray-200 rounded-full w-16 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded-full w-20 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded-full w-14 animate-pulse"></div>
          </div>
          
          <div className="mt-auto">
            <div className="h-8 bg-gray-200 rounded-md w-full animate-pulse"></div>
          </div>
        </div>
        
        {/* Main chat area skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="h-5 bg-gray-200 rounded-md w-24 animate-pulse"></div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="flex items-start">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 mr-3 animate-pulse"></div>
                <div className="flex-1">
                  <div className="flex items-baseline mb-1">
                    <div className="h-4 bg-gray-200 rounded-md w-24 animate-pulse"></div>
                    <div className="ml-2 h-3 bg-gray-200 rounded-md w-12 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-md w-full animate-pulse"></div>
                  <div className="mt-1 h-4 bg-gray-200 rounded-md w-3/4 animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-gray-200">
            <div className="h-10 bg-gray-200 rounded-md w-full animate-pulse"></div>
          </div>
        </div>
        
        {/* Right sidebar skeleton */}
        <div className="w-64 bg-gray-50 p-4 border-l border-gray-200">
          <div className="h-3 bg-gray-200 rounded-md w-2/3 mb-4 animate-pulse"></div>
          <div className="space-y-2">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 mr-2 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-md w-20 animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="relative flex h-screen bg-white text-zinc-900">
      {/* Community info sidebar - Left */}
      <div className="w-64 bg-gray-50 p-4 flex flex-col border-r border-gray-200 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-xl font-medium mb-1">{community?.name}</h1>
          <div className="text-sm text-zinc-500">#{community?.id.substring(0, 6)}</div>
        </div>
        
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2">About</div>
          <p className="text-sm text-zinc-600">{community?.description}</p>
        </div>
        
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2">Tags</div>
          <div className="flex flex-wrap gap-1">
            {community?.tags.map((tag, idx) => (
              <span key={idx} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-zinc-600">
                {tag}
              </span>
            ))}
          </div>
        </div>
        
        {/* Upcoming Events Section */}
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2">Upcoming Events</div>
          <div className="bg-white border border-gray-200 rounded-md p-3">
            <div className="flex items-center mb-2">
              <div className="bg-[#008CFF] text-white rounded-full h-6 w-6 flex items-center justify-center text-xs mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium">Community AMA</span>
            </div>
            <p className="text-xs text-zinc-600 mb-2">Join our monthly Ask Me Anything session with the community creator.</p>
            <div className="flex items-center text-xs text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Jun 25, 2024 - 7:00 PM UTC
            </div>
          </div>
        </div>
        
        {/* Exclusive Merch Section */}
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2">Exclusive Merch</div>
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-md p-3">
              <div className="h-20 bg-gray-100 rounded-md mb-2 overflow-hidden">
                <img 
                  src="https://placehold.co/400x200/e6f7ff/0070cc?text=T-Shirt" 
                  alt="Community T-Shirt" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-sm font-medium mb-1">Limited Edition T-Shirt</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">500 POINTS</span>
                <button className="text-xs bg-[#008CFF] text-white px-2 py-1 rounded hover:bg-[#0070CC]">
                  Redeem
                </button>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-md p-3">
              <div className="h-20 bg-gray-100 rounded-md mb-2 overflow-hidden">
                <img 
                  src="https://placehold.co/400x200/e6f7ff/0070cc?text=NFT" 
                  alt="Exclusive NFT" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-sm font-medium mb-1">Early Supporter Badge</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">1000 POINTS</span>
                <button className="text-xs bg-[#008CFF] text-white px-2 py-1 rounded hover:bg-[#0070CC]">
                  Redeem
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-auto">
          <Link 
            href="/communities" 
            className="w-full py-2 px-3 text-sm text-zinc-600 hover:text-zinc-900 bg-gray-100 hover:bg-gray-200 rounded-md transition flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Leave the room
          </Link>
        </div>
      </div>
      
      {/* Chat area - Center */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center">
            <div className="font-medium">Chat Room</div>
            <div className="ml-2 text-sm text-zinc-500">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-zinc-400 py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex items-start group">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden mr-3">
                  {message.senderAvatar ? (
                    <img src={message.senderAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${message.isCreator ? 'bg-[#008CFF]' : 'bg-gray-200'} ${message.isCreator ? 'text-white' : 'text-zinc-600'}`}>
                      {message.senderName?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline">
                    <span className={`font-medium ${message.isCreator ? 'text-[#008CFF]' : 'text-zinc-900'}`}>
                      {message.senderName || message.senderAddress.substring(0, 6) + '...'}
                    </span>
                    {message.isCreator && (
                      <span className="ml-2 text-xs bg-blue-50 text-[#008CFF] px-1.5 py-0.5 rounded">Creator</span>
                    )}
                    <span className="ml-2 text-xs text-zinc-400">
                      {message.timestamp?.toDate ? 
                        message.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
                        new Date(message.createdAt || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                      }
                    </span>
                  </div>
                  
                  {/* Show reply preview if this is a reply */}
                  {message.replyTo && message.replyToSender && (
                    <div className="mt-1 text-xs text-zinc-500 bg-gray-50 p-1 px-2 rounded-sm border-l-2 border-gray-300">
                      <span className="font-medium">↪ {message.replyToSender}</span>: {message.replyToText}
                    </div>
                  )}
                  
                  <div className="mt-1 text-zinc-600">{message.text}</div>
                  
                  {/* Reply button */}
                  <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleStartReply(message)}
                      className="text-xs text-zinc-500 hover:text-[#008CFF]"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
          {messageError && (
            <div className="mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              {messageError}
            </div>
          )}
          
          {replyingTo && (
            <div className="mb-2 bg-gray-50 p-2 rounded border-l-2 border-[#008CFF] flex justify-between items-start">
              <div>
                <div className="text-xs text-zinc-500">
                  Replying to <span className="font-medium text-zinc-700">{replyingTo.senderName || replyingTo.senderAddress.substring(0, 6) + '...'}</span>
                </div>
                <div className="text-sm text-zinc-600 truncate mt-1">{replyingTo.text}</div>
              </div>
              <button 
                type="button" 
                onClick={handleCancelReply} 
                className="text-zinc-400 hover:text-zinc-600"
                aria-label="Cancel reply"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          
          <div className="flex rounded-md overflow-hidden border border-gray-200">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={replyingTo ? "Type your reply..." : "Type a message..."}
              className="flex-1 px-4 py-2 bg-white text-zinc-900 focus:outline-none"
              disabled={sendingMessage}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sendingMessage}
              className="px-4 py-2 bg-[#008CFF] text-white font-medium hover:bg-[#0070CC] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingMessage ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Member list sidebar - Right */}
      <div className="w-64 bg-gray-50 p-4 border-l border-gray-200">
        <div className="text-xs uppercase text-zinc-500 font-medium mb-4">
          Members — {members.length}
        </div>
        <div className="space-y-2">
          {members.map((member) => {
            const isCreator = community?.creatorAddress?.toLowerCase() === member.walletAddress.toLowerCase();
            return (
              <div key={member.id} className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden mr-2">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${isCreator ? 'bg-[#008CFF]' : 'bg-gray-200'} ${isCreator ? 'text-white' : 'text-zinc-600'}`}>
                      {member.displayName?.[0] || member.walletAddress[0]}
                    </div>
                  )}
                </div>
                <div className="flex items-center">
                  <div className="text-sm">
                    {member.displayName || member.walletAddress.substring(0, 6) + '...'}
                  </div>
                  {isCreator && (
                    <span className="ml-2 text-xs bg-blue-50 text-[#008CFF] px-1.5 py-0.5 rounded">Creator</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Profile completion modal - outside the flex layout */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="text-center mb-4">
              <h2 className="text-xl font-medium mb-2">Complete Your Profile</h2>
              <p className="text-zinc-600">
                Welcome to {community?.name}! Before you can join the conversation, you need to complete your member profile.
              </p>
            </div>
            
            <div className="bg-blue-50 text-blue-700 p-3 rounded-md mb-4 text-sm">
              <p>Each community has its own unique member profile. This helps other members identify you and builds trust within the community.</p>
            </div>
            
            <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md mb-4 text-sm">
              <p><strong>Note:</strong> Profile completion is required to participate in this community.</p>
            </div>
            
            <div className="mt-6 text-center">
              <button
                onClick={handleProfileSetup}
                className="px-6 py-3 bg-[#008CFF] text-white rounded-md hover:bg-[#0070CC] transition font-medium"
              >
                Set Up My Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
