"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, deleteDoc, where, getDocs, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { useActiveAccount, ConnectButton } from "thirdweb/react";
import { client } from "../../../client";
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// Message type definition
interface Message {
  id: string;
  text: string;
  senderName: string;
  senderAddress: string;
  senderAvatar?: string;
  timestamp: any;
  attachments?: {
    url: string;
    type: 'image' | 'file';
    name?: string;
  }[];
  reactions?: {
    [emoji: string]: string[]; // maps emoji to array of user addresses who reacted
  };
  isDeleted?: boolean;
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
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
  membershipMinted?: number;
  tokensStaked?: number;
  treasuryBalance?: number;
}

// User profile type
interface UserProfile {
  address: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: any;
}

// New interface for community-specific profiles
interface CommunityProfile {
  userId: string;
  communityId: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  interests?: string[];
  joinedAt: any;
  isProfileComplete: boolean;
  socialLinks?: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    website?: string;
  };
  customFields?: { [key: string]: string };
}

// Add new interfaces for enhanced features
interface CommunitySettings {
  allowFileUploads: boolean;
  allowEmojis: boolean;
  allowReactions: boolean;
  allowPinnedMessages: boolean;
  guidelines: string;
  announcement?: string;
}

interface MemberRole {
  address: string;
  role: 'creator' | 'moderator' | 'member';
  joinedAt: any;
  lastActive: any;
  badges?: string[];
}

interface PinnedMessage extends Message {
  pinnedBy: string;
  pinnedAt: any;
}

// Add new interfaces for events and merch
interface Event {
  id: string;
  title: string;
  description: string;
  date: any;
  location: string;
  attendees: string[];
  maxAttendees: number;
  price: number;
  image?: string;
}

interface MerchItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
  stock: number;
}

export default function CommunityRoom() {
  const params = useParams();
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  const router = useRouter();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState(0);
  
  // New states for enhanced features
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [showMembersList, setShowMembersList] = useState(false);
  const [communityMembers, setCommunityMembers] = useState<UserProfile[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  
  // New state variables for enhanced features
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings | null>(null);
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  
  // New state variables for events and merch
  const [events, setEvents] = useState<Event[]>([]);
  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  const [showEventDetails, setShowEventDetails] = useState<string | null>(null);
  const [showMerchDetails, setShowMerchDetails] = useState<string | null>(null);
  const [userTokens, setUserTokens] = useState<number>(0);
  
  // New state variable for reply functionality
  const [replyingTo, setReplyingTo] = useState<{id: string; text: string; senderName: string} | null>(null);
  
  // New state variables for profile management
  const [communityProfile, setCommunityProfile] = useState<CommunityProfile | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [customAvatarFile, setCustomAvatarFile] = useState<File | null>(null);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check and fetch user's community profile
  useEffect(() => {
    async function checkUserProfile() {
      if (!activeAccount || !communityId) return;
      
      try {
        // Try to fetch the user's profile for this community
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          // User has a profile for this community
          setCommunityProfile(profileSnap.data() as CommunityProfile);
        } else {
          // User doesn't have a profile for this community yet
          // Redirect to profile setup page
          router.push(`/communities/${communityId}/profile/setup`);
        }
      } catch (error) {
        console.error("Error checking user profile:", error);
      }
    }
    
    checkUserProfile();
  }, [activeAccount, communityId, router]);

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
    <div className="flex flex-col bg-white h-screen">
      <div className="p-4 text-center">
        <h1 className="text-xl font-bold">{community.name}</h1>
        <p className="text-gray-600">Community Room</p>
        {activeAccount && (
          <div className="mt-4">
            <Link
              href={`/communities/${communityId}/profile/setup`}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Edit Profile
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
