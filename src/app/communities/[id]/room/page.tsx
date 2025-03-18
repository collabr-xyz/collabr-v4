"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
  attachments?: {
    url: string;
    type: 'image' | 'file';
    name?: string;
  }[];
  reactions?: {
    [emoji: string]: string[]; // maps emoji to array of user addresses who reacted
  };
  isDeleted?: boolean;
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

// User profile type
interface UserProfile {
  address: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: any;
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
    
    const unsubscribe = onSnapshot(membersQuery, (snapshot) => {
      const members: UserProfile[] = [];
      snapshot.forEach((doc) => {
        members.push(doc.data() as UserProfile);
      });
      setCommunityMembers(members);
      setOnlineMembers(members.length);
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
    
    if ((!newMessage.trim() && !attachmentFile) || !activeAccount || !communityId) return;
    
    try {
      // Prepare message data
      const messageData: any = {
        text: newMessage,
        senderName: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        senderAddress: activeAccount.address,
        senderAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
        timestamp: serverTimestamp()
      };
      
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
      
      // Clear the message input
      setNewMessage('');
      
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
  const formatMessageTime = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    
    const date = timestamp.toDate();
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
  };
  
  // Group messages by date for date separators
  const getMessageGroups = useCallback(() => {
    const groups: {date: string, messages: Message[]}[] = [];
    
    messages.forEach(message => {
      if (!message.timestamp) {
        // Handle messages without timestamp
        if (groups.length === 0 || groups[groups.length - 1].date !== 'Just now') {
          groups.push({ date: 'Just now', messages: [message] });
        } else {
          groups[groups.length - 1].messages.push(message);
        }
        return;
      }
      
      const date = message.timestamp.toDate().toDateString();
      
      // Check if there's already a group for this date
      if (groups.length === 0 || groups[groups.length - 1].date !== date) {
        groups.push({ date, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });
    
    return groups;
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
        <div className="w-64 border-r border-gray-100 bg-white overflow-y-auto">
          <div className="p-4">
            {/* User Tokens */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Your Tokens</span>
                <span className="text-sm font-semibold text-purple-600">{userTokens}</span>
              </div>
            </div>

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
        <main className="flex-1 overflow-hidden flex flex-col max-w-3xl mx-auto w-full relative">
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
          <div className="flex-1 overflow-y-auto px-4 py-6">
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
                      {group.date === new Date().toDateString() 
                        ? 'Today' 
                        : group.date === new Date(Date.now() - 86400000).toDateString()
                          ? 'Yesterday'
                          : new Date(group.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      }
                    </span>
                    <div className="h-[1px] bg-gray-100 flex-1"></div>
                  </div>
                  
                  <div className="space-y-3">
                    {group.messages.map((message) => (
                      <div 
                        key={message.id} 
                        className={`relative group ${message.senderAddress === activeAccount?.address ? 'justify-end' : 'justify-start'} flex`}
                      >
                        {message.senderAddress !== activeAccount?.address && (
                          <div className="flex items-start mr-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                              {message.senderAvatar ? (
                                <Image 
                                  src={message.senderAvatar} 
                                  alt={message.senderName} 
                                  width={32} 
                                  height={32} 
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                                  {message.senderName?.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className={`max-w-[75%] ${message.senderAddress === activeAccount?.address ? 'bg-gray-100 text-gray-800' : 'bg-white border border-gray-100 text-gray-800'} rounded-lg px-3 py-2 relative`}>
                          {/* Message menu */}
                          <div className="absolute -top-8 right-0 hidden group-hover:flex items-center space-x-1 bg-white shadow rounded-md p-1">
                            <button
                              onClick={() => {
                                setSelectedMessage(message.id);
                                setShowReactionPicker(true);
                                setShowEmojiPicker(false);
                              }}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7zm8-4c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm-6 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/>
                              </svg>
                            </button>
                            
                            {(message.senderAddress === activeAccount?.address || (community && community.creatorAddress === activeAccount?.address)) && (
                              <button
                                onClick={() => handleDeleteMessage(message.id)}
                                className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-gray-50"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
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
                          
                          {message.senderAddress !== activeAccount?.address && (
                            <div className="flex items-center space-x-1 mb-1">
                              <span className="text-xs font-medium text-gray-500">{message.senderName}</span>
                              <span className="text-xs text-gray-400">
                                {formatMessageTime(message.timestamp)}
                              </span>
                            </div>
                          )}
                          
                          {message.isDeleted ? (
                            <p className="text-sm italic text-gray-400">This message was deleted</p>
                          ) : (
                            <>
                              <p className="text-sm break-words">{message.text}</p>
                              
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
                          
                          {message.senderAddress === activeAccount?.address && (
                            <div className="flex justify-end">
                              <span className="text-xs text-gray-400">
                                {formatMessageTime(message.timestamp)}
                              </span>
                            </div>
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
              ))
            )}
            
            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center space-x-1 text-xs text-gray-400 mt-2 pl-2">
                <span>
                  {typingUsers.length === 1 
                    ? `${typingUsers[0]} is typing...` 
                    : typingUsers.length === 2 
                      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                      : `${typingUsers.length} people are typing...`
                  }
                </span>
                <div className="flex items-center">
                  <div className="h-1 w-1 bg-gray-300 rounded-full animate-bounce"></div>
                  <div className="h-1 w-1 bg-gray-300 rounded-full animate-bounce mx-1" style={{ animationDelay: '0.2s' }}></div>
                  <div className="h-1 w-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Message input */}
          <div className="border-t border-gray-100 p-4">
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
                  placeholder="Message..."
                  className="flex-1 ml-2 text-sm py-2 px-3 border border-gray-200 rounded-md focus:outline-none focus:border-gray-300 focus:ring-0"
                />
                
                {/* Send button */}
                <button
                  type="submit"
                  disabled={!newMessage.trim() && !attachmentFile}
                  className="ml-2 px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Send
                </button>
              </div>
              
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
        <div className="w-64 border-l border-gray-100 bg-white overflow-y-auto">
          <div className="p-4">
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
    </div>
  );
}
