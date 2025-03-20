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
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileSetupSkipped, setProfileSetupSkipped] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [customAvatarFile, setCustomAvatarFile] = useState<File | null>(null);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add function to get unique members
  const getUniqueMembers = useCallback((members: UserProfile[]) => {
    const uniqueMembers = new Map<string, UserProfile>();
    members.forEach(member => {
      if (!uniqueMembers.has(member.address)) {
        uniqueMembers.set(member.address, member);
      }
    });
    return Array.from(uniqueMembers.values());
  }, []);
  
  // Function to find a message by ID
  const findMessageById = useCallback((messageId: string) => {
    return messages.find(message => message.id === messageId);
  }, [messages]);
  
  // Function to scroll to a message
  const scrollToMessage = useCallback((messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Add a temporary highlight effect
      messageElement.classList.add('bg-blue-50');
      setTimeout(() => {
        messageElement.classList.remove('bg-blue-50');
      }, 2000);
    }
  }, []);
  
  // Fetch community details
  useEffect(() => {
    async function fetchCommunity() {
      try {
        const docRef = doc(db, "communities", communityId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const communityData = {
            id: docSnap.id,
            ...docSnap.data(),
            membershipMinted: docSnap.data().membershipMinted || 0,
            tokensStaked: docSnap.data().tokensStaked || 0,
            treasuryBalance: docSnap.data().treasuryBalance || 0
          } as Community;
          
          setCommunity(communityData);
          
          // Check if user is a member (this would need to be implemented based on your membership model)
          // For now, we'll always set this to true for testing purposes
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
          // Show profile setup modal, unless they've explicitly skipped it
          if (!profileSetupSkipped) {
            setShowProfileSetup(true);
          }
        }
      } catch (error) {
        console.error("Error checking user profile:", error);
      }
    }
    
    checkUserProfile();
  }, [activeAccount, communityId, profileSetupSkipped]);
  
  // Handle creating or updating the user's community profile
  const handleProfileSave = async (profileData: Partial<CommunityProfile>) => {
    if (!activeAccount || !communityId) return;
    
    try {
      const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
      
      // Merge with existing profile data if it exists
      const profileToSave: CommunityProfile = {
        userId: activeAccount.address,
        communityId: communityId,
        displayName: profileData.displayName || activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        joinedAt: communityProfile?.joinedAt || serverTimestamp(),
        isProfileComplete: true,
        ...communityProfile,
        ...profileData,
      };
      
      // Update or create profile
      if (communityProfile) {
        await updateDoc(profileRef, profileToSave as { [x: string]: any });
      } else {
        await setDoc(profileRef, profileToSave as { [x: string]: any });
      }
      
      // Update local state
      setCommunityProfile(profileToSave);
      setShowProfileSetup(false);
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Error saving profile:", error);
    }
  };
  
  // Skip profile setup for now
  const handleSkipProfileSetup = () => {
    setShowProfileSetup(false);
    setProfileSetupSkipped(true);
    
    // Create a minimal profile record to mark that they've joined
    if (activeAccount && communityId) {
      const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
      setDoc(profileRef, {
        userId: activeAccount.address,
        communityId: communityId,
        displayName: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        joinedAt: serverTimestamp(),
        isProfileComplete: false
      } as { [x: string]: any }).catch(error => console.error("Error creating minimal profile:", error));
    }
  };
  
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
  
  // Handle typing indicator
  const handleTyping = () => {
    if (!activeAccount || !communityId) return;
    
    // Set local typing state
    setIsTyping(true);
    
    // Update typing status in Firestore
    const typingRef = doc(db, "communities", communityId, "typing", activeAccount.address);
    updateDoc(typingRef, {
      isTyping: true,
      timestamp: serverTimestamp()
    }).catch(error => {
      // Document might not exist, create it
      addDoc(collection(db, "communities", communityId, "typing"), {
        userAddress: activeAccount.address,
        userName: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        isTyping: true,
        timestamp: serverTimestamp()
      });
    });
    
    // Clear previous timeout if exists
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to clear typing status
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateDoc(typingRef, {
        isTyping: false,
        timestamp: serverTimestamp()
      }).catch(error => console.error("Error updating typing status:", error));
    }, 3000);
  };
  
  // Subscribe to typing indicators
  useEffect(() => {
    if (!communityId) return;
    
    const typingRef = collection(db, "communities", communityId, "typing");
    const typingQuery = query(typingRef, where("isTyping", "==", true));
    
    const unsubscribe = onSnapshot(typingQuery, (snapshot) => {
      const typingList: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Don't include current user
        if (activeAccount && data.userAddress !== activeAccount.address) {
          typingList.push(data.userName);
        }
      });
      setTypingUsers(typingList);
    });
    
    return () => unsubscribe();
  }, [communityId, activeAccount]);
  
  // Fetch online community members
  useEffect(() => {
    if (!communityId) return;
    
    // Subscribe to online members
    const membersRef = collection(db, "communities", communityId, "members");
    const membersQuery = query(membersRef, where("isOnline", "==", true));
    
    const unsubscribe = onSnapshot(membersQuery, async (snapshot) => {
      const members: UserProfile[] = [];
      snapshot.forEach((doc) => {
        members.push(doc.data() as UserProfile);
      });
      setCommunityMembers(members);
      setOnlineMembers(members.length);
      
      // If we have active members, try to fetch their community profiles
      if (members.length > 0 && communityId) {
        try {
          // Get all profiles for this community
          const profilesRef = collection(db, "communities", communityId, "profiles");
          const profilesSnap = await getDocs(profilesRef);
          
          // Create a map of address -> profile
          const profilesMap = new Map<string, CommunityProfile>();
          profilesSnap.forEach((doc) => {
            const profile = doc.data() as CommunityProfile;
            profilesMap.set(profile.userId, profile);
          });
          
          // Update the members with their community profiles
          const updatedMembers = members.map(member => {
            const profile = profilesMap.get(member.address);
            if (profile) {
              return {
                ...member,
                name: profile.displayName || member.name,
                avatar: profile.avatar || member.avatar
              };
            }
            return member;
          });
          
          setCommunityMembers(updatedMembers);
        } catch (error) {
          console.error("Error fetching community profiles:", error);
        }
      }
    });
    
    // Set current user online status
    if (activeAccount) {
      const userRef = doc(db, "communities", communityId, "members", activeAccount.address);
      updateDoc(userRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      }).catch(() => {
        // Document might not exist, create it
        addDoc(collection(db, "communities", communityId, "members"), {
          address: activeAccount.address,
          name: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
          avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
          isOnline: true,
          lastSeen: serverTimestamp()
        });
      });
    }
    
    // Set user offline on unmount
    return () => {
      unsubscribe();
      if (activeAccount) {
        const userRef = doc(db, "communities", communityId, "members", activeAccount.address);
        updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp()
        }).catch(error => console.error("Error updating online status:", error));
      }
    };
  }, [communityId, activeAccount]);
  
  // Handle file attachment selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setAttachmentPreview(null);
      setAttachmentFile(null);
      return;
    }
    
    const file = e.target.files[0];
    setAttachmentFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachmentPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // For non-image files, just show the file name
      setAttachmentPreview(`File: ${file.name}`);
    }
  };
  
  // Cancel attachment upload
  const cancelAttachment = () => {
    setAttachmentPreview(null);
    setAttachmentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Upload file to Firebase Storage
  const uploadFile = async (file: File): Promise<string> => {
    const storage = getStorage();
    const storageRef = ref(storage, `communities/${communityId}/attachments/${Date.now()}_${file.name}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  };
  
  // Handle sending a message with attachment
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("Send message button clicked", { 
      newMessage, 
      hasAttachment: !!attachmentFile, 
      activeAccount, 
      communityId 
    });
    
    if ((!newMessage.trim() && !attachmentFile) || !activeAccount || !communityId) return;
    
    try {
      // Clear the message input immediately before async operations
      const messageText = newMessage.trim();
      setNewMessage('');
      
      // Get the user's display name from their community profile if available
      const userDisplayName = communityProfile?.displayName || 
        activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4);
      
      // Prepare message data with a client-side timestamp for immediate display
      const clientTimestamp = new Date();
      const messageData: any = {
        text: messageText,
        senderName: userDisplayName,
        senderAddress: activeAccount.address,
        senderAvatar: communityProfile?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
        timestamp: serverTimestamp(),
        clientTimestamp: clientTimestamp // Add client-side timestamp for immediate display
      };
      
      // Add reply data if replying to a message
      if (replyingTo) {
        messageData.replyTo = {
          id: replyingTo.id,
          text: replyingTo.text,
          senderName: replyingTo.senderName
        };
        
        // Clear the reply state
        setReplyingTo(null);
      }
      
      // If there's an attachment, upload it first
      if (attachmentFile) {
        const downloadURL = await uploadFile(attachmentFile);
        const isImage = attachmentFile.type.startsWith('image/');
        
        messageData.attachments = [{
          url: downloadURL,
          type: isImage ? 'image' : 'file',
          name: attachmentFile.name
        }];
        
        // Reset attachment state
        setAttachmentPreview(null);
        setAttachmentFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
      
      // Add the message to Firestore
      const messagesRef = collection(db, "communities", communityId, "messages");
      await addDoc(messagesRef, messageData);
      
      // Clear typing indicator
      if (activeAccount) {
        const typingRef = doc(db, "communities", communityId, "typing", activeAccount.address);
        updateDoc(typingRef, {
          isTyping: false,
          timestamp: serverTimestamp()
        }).catch(error => console.error("Error updating typing status:", error));
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };
  
  // Add reaction to message
  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!activeAccount || !communityId) return;
    
    try {
      // Get the current message
      const messageRef = doc(db, "communities", communityId, "messages", messageId);
      const messageSnap = await getDoc(messageRef);
      
      if (messageSnap.exists()) {
        const messageData = messageSnap.data();
        const reactions = messageData.reactions || {};
        
        // Check if user already reacted with this emoji
        const emojiReactions = reactions[emoji] || [];
        const userIndex = emojiReactions.indexOf(activeAccount.address);
        
        if (userIndex > -1) {
          // User already reacted with this emoji, remove the reaction
          emojiReactions.splice(userIndex, 1);
        } else {
          // Add user's reaction
          emojiReactions.push(activeAccount.address);
        }
        
        // Update reactions
        if (emojiReactions.length > 0) {
          reactions[emoji] = emojiReactions;
        } else {
          delete reactions[emoji];
        }
        
        // Update the message in Firestore
        await updateDoc(messageRef, { reactions });
      }
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
    
    // Close reaction picker
    setShowReactionPicker(false);
    setSelectedMessage(null);
  };
  
  // Delete message
  const handleDeleteMessage = async (messageId: string) => {
    if (!activeAccount || !communityId) return;
    
    try {
      const messageRef = doc(db, "communities", communityId, "messages", messageId);
      const messageSnap = await getDoc(messageRef);
      
      if (messageSnap.exists()) {
        const messageData = messageSnap.data();
        
        // Only allow users to delete their own messages or community creators
        if (messageData.senderAddress === activeAccount.address || 
            (community && community.creatorAddress === activeAccount.address)) {
          // Instead of actual deletion, mark as deleted to preserve conversation flow
          await updateDoc(messageRef, { isDeleted: true });
        }
      }
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };
  
  // Format timestamp to be displayed in messages
  const formatMessageTime = (timestamp: any, clientTimestamp?: Date) => {
    try {
      // First try to use server timestamp, fall back to client timestamp if not available
      if (!timestamp && !clientTimestamp) return 'Just now';
      
      let date;
      // Safely convert timestamp to date
      if (timestamp) {
        if (typeof timestamp.toDate === 'function') {
          date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
          date = timestamp;
        }
      } else {
        date = clientTimestamp;
      }
      
      // If we couldn't get a valid date, just return "Just now"
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Just now';
      }
      
      const now = new Date();
      
      // For messages from today, show only time
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      
      // For messages from yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // For older messages, show date and time
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      console.error("Error formatting message time:", error);
      return 'Just now';
    }
  };
  
  // Group messages by date for date separators and by sender for Discord-like UI
  const getMessageGroups = useCallback(() => {
    const dateGroups: {date: string, messages: Message[]}[] = [];
    
    messages.forEach(message => {
      // Use clientTimestamp if server timestamp is not available
      const effectiveTimestamp = message.timestamp || (message as any).clientTimestamp;
      let dateString = 'Just now'; // Default value
      
      try {
        // Get date string from either server or client timestamp
        if (effectiveTimestamp) {
          if (effectiveTimestamp instanceof Date) {
            dateString = effectiveTimestamp.toDateString();
          } else if (effectiveTimestamp && typeof effectiveTimestamp.toDate === 'function') {
            const dateObj = effectiveTimestamp.toDate();
            dateString = dateObj.toDateString();
          }
        }
      } catch (error) {
        console.error("Error getting date string for message:", error);
        // Keep using the default dateString
      }
      
      // Check if there's already a group for this date
      if (dateGroups.length === 0 || dateGroups[dateGroups.length - 1].date !== dateString) {
        dateGroups.push({ date: dateString, messages: [message] });
      } else {
        dateGroups[dateGroups.length - 1].messages.push(message);
      }
    });
    
    // For each date group, group messages by sender and by time proximity
    const result = dateGroups.map(dateGroup => {
      const senderGroups: Message[][] = [];
      let currentGroup: Message[] = [];
      let previousSender = '';
      let previousTime = 0;
      
      dateGroup.messages.forEach(message => {
        let currentTime = Date.now(); // Default to current time
        
        try {
          // Get message time for grouping
          const effectiveTimestamp = message.timestamp || (message as any).clientTimestamp;
          if (effectiveTimestamp) {
            if (effectiveTimestamp instanceof Date) {
              currentTime = effectiveTimestamp.getTime();
            } else if (typeof effectiveTimestamp.toDate === 'function') {
              const dateObj = effectiveTimestamp.toDate();
              currentTime = dateObj.getTime();
            }
          }
        } catch (error) {
          console.error("Error getting message time:", error);
          // Keep using the default currentTime
        }
        
        const timeDiff = currentTime - previousTime;
        
        // Start a new group if:
        // 1. This is the first message
        // 2. Sender changed
        // 3. More than 5 minutes passed since the last message
        if (
          currentGroup.length === 0 || 
          message.senderAddress !== previousSender ||
          timeDiff > 5 * 60 * 1000 // 5 minutes
        ) {
          if (currentGroup.length > 0) {
            senderGroups.push([...currentGroup]);
          }
          currentGroup = [message];
        } else {
          currentGroup.push(message);
        }
        
        previousSender = message.senderAddress;
        previousTime = currentTime;
      });
      
      // Add the last group if it's not empty
      if (currentGroup.length > 0) {
        senderGroups.push(currentGroup);
      }
      
      return {
        date: dateGroup.date,
        senderGroups
      };
    });
    
    return result;
  }, [messages]);
  
  // Fetch events and merch items
  useEffect(() => {
    if (!communityId) return;

    // Subscribe to events
    const eventsRef = collection(db, "communities", communityId, "events");
    const eventsQuery = query(eventsRef, orderBy("date", "asc"));

    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const eventsList: Event[] = [];
      snapshot.forEach((doc) => {
        eventsList.push({
          id: doc.id,
          ...doc.data()
        } as Event);
      });
      setEvents(eventsList);
    });

    // Subscribe to merch items
    const merchRef = collection(db, "communities", communityId, "merch");
    const merchQuery = query(merchRef, orderBy("name", "asc"));

    const unsubscribeMerch = onSnapshot(merchQuery, (snapshot) => {
      const merchList: MerchItem[] = [];
      snapshot.forEach((doc) => {
        merchList.push({
          id: doc.id,
          ...doc.data()
        } as MerchItem);
      });
      setMerchItems(merchList);
    });

    // Fetch user's token balance
    if (activeAccount) {
      const userRef = doc(db, "users", activeAccount.address);
      getDoc(userRef).then((doc) => {
        if (doc.exists()) {
          setUserTokens(doc.data().tokens || 0);
        }
      });
    }

    return () => {
      unsubscribeEvents();
      unsubscribeMerch();
    };
  }, [communityId, activeAccount]);

  // Handle event registration
  const handleEventRegistration = async (eventId: string) => {
    if (!activeAccount || !communityId) return;

    try {
      const eventRef = doc(db, "communities", communityId, "events", eventId);
      const eventSnap = await getDoc(eventRef);

      if (eventSnap.exists()) {
        const eventData = eventSnap.data() as Event;
        
        // Check if user has enough tokens
        if (userTokens < eventData.price) {
          alert("Not enough tokens to register for this event");
          return;
        }

        // Check if event is full
        if (eventData.attendees.length >= eventData.maxAttendees) {
          alert("This event is full");
          return;
        }

        // Check if user is already registered
        if (eventData.attendees.includes(activeAccount.address)) {
          alert("You are already registered for this event");
          return;
        }

        // Update event attendees and user's tokens
        await updateDoc(eventRef, {
          attendees: [...eventData.attendees, activeAccount.address]
        });

        // Update user's tokens
        const userRef = doc(db, "users", activeAccount.address);
        await updateDoc(userRef, {
          tokens: userTokens - eventData.price
        });

        setUserTokens(prev => prev - eventData.price);
        setShowEventDetails(null);
      }
    } catch (error) {
      console.error("Error registering for event:", error);
      alert("Failed to register for event. Please try again.");
    }
  };

  // Handle merch purchase
  const handleMerchPurchase = async (itemId: string) => {
    if (!activeAccount || !communityId) return;

    try {
      const itemRef = doc(db, "communities", communityId, "merch", itemId);
      const itemSnap = await getDoc(itemRef);

      if (itemSnap.exists()) {
        const itemData = itemSnap.data() as MerchItem;
        
        // Check if item is available
        if (!itemData.available || itemData.stock <= 0) {
          alert("This item is no longer available");
          return;
        }

        // Check if user has enough tokens
        if (userTokens < itemData.price) {
          alert("Not enough tokens to purchase this item");
          return;
        }

        // Update item stock and user's tokens
        await updateDoc(itemRef, {
          stock: itemData.stock - 1
        });

        // Update user's tokens
        const userRef = doc(db, "users", activeAccount.address);
        await updateDoc(userRef, {
          tokens: userTokens - itemData.price
        });

        setUserTokens(prev => prev - itemData.price);
        setShowMerchDetails(null);
      }
    } catch (error) {
      console.error("Error purchasing merch:", error);
      alert("Failed to purchase item. Please try again.");
    }
  };
  
  // Handle initiating a reply to a message
  const handleReplyToMessage = (message: Message) => {
    // Set the replying state
    setReplyingTo({
      id: message.id,
      text: message.text,
      senderName: message.senderName
    });
    
    // Focus on the input field
    const inputField = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (inputField) {
      inputField.focus();
    }
  };
  
  // Handle avatar file upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    setCustomAvatarFile(file);
    
    // Upload the avatar to Firebase Storage
    if (communityId && activeAccount) {
      try {
        const storage = getStorage();
        const storageRef = ref(storage, `communities/${communityId}/avatars/${activeAccount.address}_${Date.now()}`);
        
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        
        setCustomAvatarUrl(downloadURL);
      } catch (error) {
        console.error("Error uploading avatar:", error);
        alert("Failed to upload avatar. Please try again.");
      }
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
  
  // Debug message to check wallet connection status
  console.log("Wallet connection status:", { 
    isActiveAccountAvailable: !!activeAccount,
    activeAccountAddress: activeAccount?.address,
    communityId
  });
  
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
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Enhanced Header */}
      <header className="border-b border-gray-100 py-3 px-4 sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <Link href={`/communities/${communityId}`} className="text-gray-400 hover:text-gray-600 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="text-base font-medium text-gray-800">{community.name}</h1>
            <div className="flex items-center ml-2 text-xs text-gray-400">
              <span>{getUniqueMembers(communityMembers).length} members</span>
            </div>
          </div>
          
          {/* Community Actions */}
          <div className="flex items-center space-x-2">
            {!activeAccount ? (
              <ConnectButton
                client={client}
                appMetadata={{
                  name: "Collabr",
                  url: "https://collabr.xyz",
                }}
              />
            ) : (
              <>
                {/* Guidelines Button */}
                <button
                  onClick={() => setShowGuidelines(!showGuidelines)}
                  className="text-gray-400 hover:text-gray-600 p-2"
                  title="Community Guidelines"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                  </svg>
                </button>
                
                {/* Announcement Button */}
                {communitySettings?.announcement && (
                  <button
                    onClick={() => setShowAnnouncement(!showAnnouncement)}
                    className="text-gray-400 hover:text-gray-600 p-2"
                    title="Announcement"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h28a1 1 0 00.894-1.447l-4.764-7.553A1 1 0 0018 3z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                
                {/* Settings Button (for creator/moderators) */}
                {(community?.creatorAddress === activeAccount?.address || isModerator) && (
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="text-gray-400 hover:text-gray-600 p-2"
                    title="Community Settings"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Guidelines Modal */}
      {showGuidelines && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Community Guidelines</h2>
              <button onClick={() => setShowGuidelines(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="prose prose-sm">
              {communitySettings?.guidelines || "No guidelines set yet."}
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {showAnnouncement && communitySettings?.announcement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Announcement</h2>
              <button onClick={() => setShowAnnouncement(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="prose prose-sm">
              {communitySettings.announcement}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (community?.creatorAddress === activeAccount?.address || isModerator) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Community Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Community Guidelines</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                  rows={4}
                  value={communitySettings?.guidelines || ""}
                  onChange={(e) => setCommunitySettings(prev => prev ? {...prev, guidelines: e.target.value} : null)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Announcement</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                  rows={3}
                  value={communitySettings?.announcement || ""}
                  onChange={(e) => setCommunitySettings(prev => prev ? {...prev, announcement: e.target.value} : null)}
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-600 focus:ring-gray-400"
                    checked={communitySettings?.allowFileUploads}
                    onChange={(e) => setCommunitySettings(prev => prev ? {...prev, allowFileUploads: e.target.checked} : null)}
                  />
                  <span className="ml-2 text-sm text-gray-700">Allow file uploads</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-600 focus:ring-gray-400"
                    checked={communitySettings?.allowEmojis}
                    onChange={(e) => setCommunitySettings(prev => prev ? {...prev, allowEmojis: e.target.checked} : null)}
                  />
                  <span className="ml-2 text-sm text-gray-700">Allow emojis</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-600 focus:ring-gray-400"
                    checked={communitySettings?.allowReactions}
                    onChange={(e) => setCommunitySettings(prev => prev ? {...prev, allowReactions: e.target.checked} : null)}
                  />
                  <span className="ml-2 text-sm text-gray-700">Allow reactions</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-600 focus:ring-gray-400"
                    checked={communitySettings?.allowPinnedMessages}
                    onChange={(e) => setCommunitySettings(prev => prev ? {...prev, allowPinnedMessages: e.target.checked} : null)}
                  />
                  <span className="ml-2 text-sm text-gray-700">Allow pinned messages</span>
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Save settings logic here
                    setShowSettings(false);
                  }}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content with sidebars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Events and Merch */}
        <div className="w-64 border-r border-gray-100 bg-white overflow-y-auto h-full">{/* Added h-full */}
          <div className="p-4">
            {/* Upcoming Events */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-800 mb-3">Upcoming Events</h3>
              <div className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-xs text-gray-400">No upcoming events</p>
                ) : (
                  events.map((event) => (
                    <div 
                      key={event.id} 
                      className="bg-white border border-gray-100 rounded-lg p-3 cursor-pointer hover:border-gray-200 transition"
                      onClick={() => setShowEventDetails(event.id)}
                    >
                      <div className="flex items-start space-x-3">
                        {event.image && (
                          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
                            <Image
                              src={event.image}
                              alt={event.title}
                              width={48}
                              height={48}
                              className="object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-800 truncate">{event.title}</h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(event.date?.toDate()).toLocaleDateString()}
                          </p>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-gray-500">
                              {event.attendees.length}/{event.maxAttendees} attending
                            </span>
                            <span className="text-xs text-purple-600 ml-2">
                              {event.price} tokens
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Merch Shop */}
            <div>
              <h3 className="text-sm font-medium text-gray-800 mb-3">Exclusive Merch</h3>
              <div className="space-y-3">
                {merchItems.length === 0 ? (
                  <p className="text-xs text-gray-400">No items available</p>
                ) : (
                  merchItems.map((item) => (
                    <div 
                      key={item.id}
                      className="bg-white border border-gray-100 rounded-lg p-3 cursor-pointer hover:border-gray-200 transition"
                      onClick={() => setShowMerchDetails(item.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-800 truncate">{item.name}</h4>
                          <p className="text-xs text-gray-500 mt-1 truncate">{item.description}</p>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-purple-600">
                              {item.price} tokens
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {item.stock} left
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main chat area */}
        <main className="flex-1 overflow-hidden flex flex-col max-w-3xl mx-auto w-full h-full">{/* Changed relative to h-full */}
          {/* Pinned Messages */}
          {pinnedMessages.length > 0 && (
            <div className="border-b border-gray-100 p-2 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-gray-500">Pinned Messages</h3>
                <button
                  onClick={() => setPinnedMessages([])}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2">
                {pinnedMessages.map((message) => (
                  <div key={message.id} className="bg-white rounded-lg p-2 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{message.senderName}</span>
                      <span className="text-xs text-gray-400">
                        {formatMessageTime(message.pinnedAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{message.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages container */}
          <div className="flex-1 overflow-y-auto px-4 py-6 h-0">
            {messages.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm">No messages yet</p>
              </div>
            ) : (
              getMessageGroups().map((group, groupIndex) => (
                <div key={groupIndex} className="mb-6">
                  <div className="flex items-center justify-center mb-3">
                    <div className="h-[1px] bg-gray-100 flex-1"></div>
                    <span className="text-xs text-gray-400 mx-3">
                      {group.date === 'Just now' 
                        ? 'Just now'
                        : group.date === new Date().toDateString() 
                          ? 'Today' 
                          : group.date === new Date(Date.now() - 86400000).toDateString()
                            ? 'Yesterday'
                            : (() => {
                                try {
                                  return new Date(group.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                } catch (e) {
                                  return group.date;
                                }
                              })()
                      }
                    </span>
                    <div className="h-[1px] bg-gray-100 flex-1"></div>
                  </div>
                  
                  <div className="space-y-6">
                    {group.senderGroups.map((messages, senderIndex) => {
                      // Get the first message for the sender info
                      const firstMessage = messages[0];
                      return (
                        <div key={`${groupIndex}-${senderIndex}`} className="group">
                          {/* Sender info - only shown once per group */}
                          <div className="flex items-start mb-1">
                            <div className="flex items-start mr-2">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                                {firstMessage.senderAvatar ? (
                                  <Image 
                                    src={firstMessage.senderAvatar} 
                                    alt={firstMessage.senderName} 
                                    width={32} 
                                    height={32} 
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                                    {firstMessage.senderName?.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm text-gray-800">{firstMessage.senderName}</span>
                              <span className="text-xs text-gray-400">
                                {formatMessageTime(firstMessage.timestamp, (firstMessage as any).clientTimestamp)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Message bubbles */}
                          <div className="pl-10 space-y-1">
                            {messages.map((message, messageIndex) => (
                              <div key={message.id} id={`message-${message.id}`} className="group relative">
                                <div className={`${message.senderAddress === activeAccount?.address ? 'bg-gray-100' : 'bg-white border border-gray-100'} rounded-lg px-3 py-2 relative max-w-[90%]`}>
                                  {/* Message menu - only shown when hovering */}
                                  <div className="absolute -top-6 right-0 hidden group-hover:flex items-center space-x-1 bg-white shadow rounded-md p-1 z-10">
                                    <button
                                      onClick={() => {
                                        setSelectedMessage(message.id);
                                        setShowReactionPicker(true);
                                        setShowEmojiPicker(false);
                                      }}
                                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7zm8-4c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm-6 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleReplyToMessage(message)}
                                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                      </svg>
                                    </button>
                                  </div>
                                  
                                  {/* Reaction picker */}
                                  {showReactionPicker && selectedMessage === message.id && (
                                    <div className="absolute -top-12 left-0 bg-white shadow rounded-full py-1 px-2 flex items-center space-x-1 z-20">
                                      {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                                        <button
                                          key={emoji}
                                          onClick={() => handleAddReaction(message.id, emoji)}
                                          className="hover:bg-gray-100 rounded-full p-1 transition"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {message.isDeleted ? (
                                    <p className="text-sm italic text-gray-400">This message was deleted</p>
                                  ) : (
                                    <>
                                      {/* Show replied message if this is a reply */}
                                      {message.replyTo && (
                                        <div 
                                          className="mb-1 pl-2 border-l-2 border-gray-200 cursor-pointer hover:bg-gray-50 rounded-l"
                                          onClick={() => scrollToMessage(message.replyTo!.id)}
                                        >
                                          <div className="flex items-center mb-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                            </svg>
                                            <span className="text-xs font-medium text-gray-500">
                                              Reply to {message.replyTo.senderName}
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-500 truncate">
                                            {message.replyTo.text.length > 50 
                                              ? message.replyTo.text.substring(0, 50) + '...' 
                                              : message.replyTo.text}
                                          </p>
                                        </div>
                                      )}
                                
                                      <p className="text-sm break-words text-gray-800">{message.text}</p>
                                      
                                      {message.attachments && message.attachments.length > 0 && (
                                        <div className="mt-2">
                                          {message.attachments.map((attachment, index) => (
                                            <div key={index} className="mt-1">
                                              {attachment.type === 'image' ? (
                                                <div className="rounded-md overflow-hidden">
                                                  <Image 
                                                    src={attachment.url} 
                                                    alt="Image attachment" 
                                                    width={200} 
                                                    height={150} 
                                                    className="max-w-[200px] object-cover"
                                                  />
                                                </div>
                                              ) : (
                                                <a 
                                                  href={attachment.url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="flex items-center space-x-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                  </svg>
                                                  <span>{attachment.name || 'Download file'}</span>
                                                </a>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  
                                  {/* Display reactions */}
                                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {Object.entries(message.reactions).map(([emoji, users]) => (
                                        <div 
                                          key={emoji} 
                                          className="inline-flex items-center space-x-1 bg-gray-50 rounded-full py-0.5 px-2 text-xs"
                                          title={`${users.length} reaction${users.length !== 1 ? 's' : ''}`}
                                        >
                                          <span>{emoji}</span>
                                          <span className="text-gray-500">{users.length}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Message input */}
          <div className="border-t border-gray-100 p-4 flex-shrink-0 bg-white">{/* Added flex-shrink-0 and bg-white */}
            <form onSubmit={handleSendMessage} className="space-y-2">
              {/* Attachment preview */}
              {attachmentPreview && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      {attachmentPreview.startsWith('data:image') 
                        ? 'Image attachment' 
                        : attachmentPreview.replace('File: ', '')}
                    </div>
                    <button 
                      type="button"
                      onClick={cancelAttachment}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  {attachmentPreview.startsWith('data:image') && (
                    <div className="mt-1">
                      <img 
                        src={attachmentPreview} 
                        alt="Preview" 
                        className="max-h-32 rounded-md object-contain" 
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Reply indicator */}
              {replyingTo && (
                <div className="bg-gray-50 p-2 rounded-md flex items-center justify-between">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    <div>
                      <div className="text-xs text-gray-600">
                        Replying to <span className="font-medium">{replyingTo.senderName}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">
                        {replyingTo.text.length > 50 
                          ? replyingTo.text.substring(0, 50) + '...' 
                          : replyingTo.text}
                      </div>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex items-center">
                {/* File input (hidden) */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                />
                
                {/* Attachment button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                
                {/* Emoji picker button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowReactionPicker(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7zm8-4c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm-6 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/>
                  </svg>
                </button>
                
                {/* Message input */}
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e as any);
                    }
                  }}
                  placeholder="Message..."
                  className="flex-1 ml-2 text-sm py-2 px-3 border border-gray-200 rounded-md focus:outline-none focus:border-gray-300 focus:ring-0 text-black"
                />
                
                {/* Send button */}
                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !attachmentFile) || !activeAccount}
                  className="ml-2 px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {!activeAccount ? 'Connect Wallet' : 'Send'}
                </button>
              </div>
              
              {/* Wallet connection warning */}
              {!activeAccount && (
                <div className="mt-2 p-2 bg-yellow-50 rounded-md">
                  <p className="text-xs text-yellow-700">Please connect your wallet to send messages</p>
                </div>
              )}
              
              {/* Emoji picker */}
              {showEmojiPicker && (
                <div className="bg-white shadow-md rounded-md p-2 max-w-xs mx-auto overflow-y-auto max-h-40">
                  <div className="grid grid-cols-8 gap-1">
                    {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setNewMessage(prev => prev + emoji);
                          setShowEmojiPicker(false);
                        }}
                        className="text-lg hover:bg-gray-100 p-1 rounded"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>
        </main>
        
        {/* Right sidebar - Members list */}
        <div className="w-64 border-l border-gray-100 bg-white overflow-y-auto h-full">{/* Added h-full */}
          <div className="p-4">
            {/* Community Information Section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-800 mb-3">Community Info</h3>
              <div className="space-y-2">
                {activeAccount && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">Your Profile</span>
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        className="text-xs text-purple-600 hover:text-purple-800"
                      >
                        {communityProfile?.isProfileComplete ? 'Edit Profile' : 'Complete Profile'}
                      </button>
                    </div>
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 mr-2">
                        {communityProfile?.avatar ? (
                          <Image 
                            src={communityProfile.avatar} 
                            alt={communityProfile.displayName} 
                            width={32} 
                            height={32} 
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                            {communityProfile?.displayName?.slice(0, 2).toUpperCase() || activeAccount.address.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-gray-700">
                        {communityProfile?.displayName || (activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4))}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">NFT Memberships</span>
                    <span className="text-xs font-medium text-gray-700">
                      {community?.membershipMinted || 0}/{community?.membershipLimit || 0}
                    </span>
                  </div>
                  {/* Progress bar for membership minting */}
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                    <div 
                      className="bg-purple-600 h-1.5 rounded-full" 
                      style={{ 
                        width: `${community?.membershipLimit ? (community.membershipMinted || 0) / community.membershipLimit * 100 : 0}%` 
                      }}
                    ></div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Tokens Staked</span>
                    <span className="text-xs font-medium text-purple-600">
                      {community?.tokensStaked?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Treasury Balance</span>
                    <span className="text-xs font-medium text-purple-600">
                      {community?.treasuryBalance?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Contract Address</span>
                  </div>
                  <a 
                    href={`https://etherscan.io/address/${community?.nftContractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer" 
                    className="text-xs text-blue-500 hover:text-blue-700 truncate block mt-0.5"
                  >
                    {community?.nftContractAddress?.slice(0, 6)}...{community?.nftContractAddress?.slice(-4)}
                  </a>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium text-gray-800 mb-3">Members</h3>
            
            <div className="space-y-2">
              {getUniqueMembers(communityMembers).length === 0 ? (
                <p className="text-xs text-gray-400">No members</p>
              ) : (
                getUniqueMembers(communityMembers).map((member) => {
                  const memberRole = memberRoles.find(r => r.address === member.address);
                  return (
                    <div key={member.address} className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
                        {member.avatar ? (
                          <Image 
                            src={member.avatar} 
                            alt={member.name} 
                            width={32} 
                            height={32} 
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                            {member.name?.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1">
                          <p className="text-xs font-medium text-gray-700 truncate">{member.name}</p>
                          {memberRole && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              memberRole.role === 'creator' 
                                ? 'bg-purple-100 text-purple-700'
                                : memberRole.role === 'moderator'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {memberRole.role}
                            </span>
                          )}
                        </div>
                        {memberRole && (
                          <p className="text-xs text-gray-400">
                            Joined {new Date(memberRole.joinedAt?.toDate()).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Community Statistics */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-800 mb-3">Community Stats</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-500">Total Messages</p>
                  <p className="font-medium text-gray-700">{messages.length}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-500">Active Today</p>
                  <p className="font-medium text-gray-700">
                    {communityMembers.filter(m => {
                      const role = memberRoles.find(r => r.address === m.address);
                      return role && new Date(role.lastActive?.toDate()).toDateString() === new Date().toDateString();
                    }).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {showEventDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Event Details</h2>
              <button onClick={() => setShowEventDetails(null)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {events.find(e => e.id === showEventDetails) && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Title</h3>
                  <p className="text-sm text-gray-900 mt-1">{events.find(e => e.id === showEventDetails)?.title}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Description</h3>
                  <p className="text-sm text-gray-900 mt-1">{events.find(e => e.id === showEventDetails)?.description}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Date & Location</h3>
                  <p className="text-sm text-gray-900 mt-1">
                    {new Date(events.find(e => e.id === showEventDetails)?.date?.toDate()).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{events.find(e => e.id === showEventDetails)?.location}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Price</h3>
                  <p className="text-sm text-purple-600 mt-1">{events.find(e => e.id === showEventDetails)?.price} tokens</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Attendees</h3>
                  <p className="text-sm text-gray-900 mt-1">
                    {events.find(e => e.id === showEventDetails)?.attendees.length} / {events.find(e => e.id === showEventDetails)?.maxAttendees}
                  </p>
                </div>
                <button
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
                  onClick={() => handleEventRegistration(showEventDetails)}
                >
                  Register for Event
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Merch Details Modal */}
      {showMerchDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Merch Details</h2>
              <button onClick={() => setShowMerchDetails(null)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {merchItems.find(i => i.id === showMerchDetails) && (
              <div className="space-y-4">
                <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden">
                  <Image
                    src={merchItems.find(i => i.id === showMerchDetails)?.image || ''}
                    alt={merchItems.find(i => i.id === showMerchDetails)?.name || ''}
                    width={400}
                    height={225}
                    className="object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Name</h3>
                  <p className="text-sm text-gray-900 mt-1">{merchItems.find(i => i.id === showMerchDetails)?.name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Description</h3>
                  <p className="text-sm text-gray-900 mt-1">{merchItems.find(i => i.id === showMerchDetails)?.description}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Price & Stock</h3>
                  <p className="text-sm text-purple-600 mt-1">{merchItems.find(i => i.id === showMerchDetails)?.price} tokens</p>
                  <p className="text-sm text-gray-900 mt-1">{merchItems.find(i => i.id === showMerchDetails)?.stock} items available</p>
                </div>
                <button
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
                  onClick={() => handleMerchPurchase(showMerchDetails)}
                >
                  Purchase with Tokens
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Setup Modal */}
      {(showProfileSetup || isEditingProfile) && activeAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">
                {isEditingProfile ? 'Edit Your Profile' : 'Create Your Community Profile'}
              </h2>
              {isEditingProfile && (
                <button 
                  onClick={() => setIsEditingProfile(false)} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            
            <div className="text-sm text-gray-600 mb-4">
              {isEditingProfile 
                ? "Update your profile information for this community."
                : <p>Welcome to <span className="font-medium">{community?.name}</span>! Please set up your profile for this community. This profile will only be visible within this community.</p>
              }
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              
              const displayName = formData.get('displayName') as string;
              const bio = formData.get('bio') as string;
              const twitter = formData.get('twitter') as string;
              const discord = formData.get('discord') as string;
              const telegram = formData.get('telegram') as string;
              const website = formData.get('website') as string;
              const avatarType = formData.get('avatarType') as string;
              
              // Build profile data
              const profileData: Partial<CommunityProfile> = {
                displayName: displayName || (activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4)),
                bio,
                socialLinks: {
                  twitter,
                  discord,
                  telegram,
                  website
                }
              };
              
              // Set avatar based on selected type
              if (avatarType === 'default') {
                profileData.avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`;
              } else if (avatarType === 'custom' && customAvatarUrl) {
                profileData.avatar = customAvatarUrl;
              }
              
              handleProfileSave(profileData);
            }} className="space-y-4">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name*
                </label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  defaultValue={communityProfile?.displayName || ''}
                  placeholder={activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                  required
                />
              </div>
              
              {/* Avatar Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Avatar
                </label>
                
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="avatarDefault"
                      name="avatarType"
                      value="default"
                      defaultChecked={!communityProfile?.avatar || communityProfile.avatar.includes('dicebear')}
                      className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="avatarDefault" className="ml-2 block text-sm text-gray-700">
                      Use default avatar
                    </label>
                    <div className="ml-2 w-8 h-8 rounded-full overflow-hidden">
                      <Image
                        src={`https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`}
                        alt="Default avatar"
                        width={32}
                        height={32}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        type="radio"
                        id="avatarCustom"
                        name="avatarType"
                        value="custom"
                        defaultChecked={!!communityProfile?.avatar && !communityProfile.avatar.includes('dicebear')}
                        className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                    </div>
                    <div className="ml-2 text-sm">
                      <label htmlFor="avatarCustom" className="font-medium text-gray-700">
                        Upload custom avatar
                      </label>
                      {customAvatarFile ? (
                        <div className="mt-2 flex items-center">
                          <div className="w-10 h-10 rounded-full overflow-hidden">
                            <Image
                              src={URL.createObjectURL(customAvatarFile)}
                              alt="Custom avatar preview"
                              width={40}
                              height={40}
                              className="object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomAvatarFile(null)}
                            className="ml-2 text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <label 
                            htmlFor="avatarUpload"
                            className="cursor-pointer inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                          >
                            Choose file
                          </label>
                          <input
                            id="avatarUpload"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleAvatarUpload}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  defaultValue={communityProfile?.bio || ''}
                  rows={3}
                  placeholder="Tell the community about yourself..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Social Links</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="twitter" className="block text-sm text-gray-700 mb-1">
                      Twitter
                    </label>
                    <input
                      type="text"
                      id="twitter"
                      name="twitter"
                      defaultValue={communityProfile?.socialLinks?.twitter || ''}
                      placeholder="@username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="discord" className="block text-sm text-gray-700 mb-1">
                      Discord
                    </label>
                    <input
                      type="text"
                      id="discord"
                      name="discord"
                      defaultValue={communityProfile?.socialLinks?.discord || ''}
                      placeholder="username#0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="telegram" className="block text-sm text-gray-700 mb-1">
                      Telegram
                    </label>
                    <input
                      type="text"
                      id="telegram"
                      name="telegram"
                      defaultValue={communityProfile?.socialLinks?.telegram || ''}
                      placeholder="@username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="website" className="block text-sm text-gray-700 mb-1">
                      Website
                    </label>
                    <input
                      type="text"
                      id="website"
                      name="website"
                      defaultValue={communityProfile?.socialLinks?.website || ''}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                {!isEditingProfile && (
                  <button
                    type="button"
                    onClick={handleSkipProfileSetup}
                    className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    Skip for Now
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  {isEditingProfile ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
