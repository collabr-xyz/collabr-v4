"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, orderBy, Timestamp, setDoc, limit } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useActiveAccount, ConnectButton } from "thirdweb/react";
import { getContract, readContract, defineChain } from "thirdweb";
import { client } from '../../../client';
import Link from 'next/link';
import Image from 'next/image';

// Define Base Sepolia testnet
const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  rpc: "https://sepolia.base.org",
  rpcUrls: {
    default: {
      http: ["https://sepolia.base.org"],
    },
    public: {
      http: ["https://sepolia.base.org"],
    },
  },
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://sepolia-explorer.base.org",
    },
  },
  testnet: true,
});

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

interface MerchandiseItem {
  id: string;
  name: string;
  description?: string;
  imageUrl: string;
  pointsCost: number;
  communityId: string;
  createdAt: string;
  available: boolean;
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
  cachedDisplayName?: string;
}

export default function ChatRoom() {
  const params = useParams();
  const router = useRouter(); 
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [merchandise, setMerchandise] = useState<MerchandiseItem[]>([]);
  const [merchandiseLoading, setMerchandiseLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<'member' | 'nonmember' | 'loading'>('loading');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{show: boolean, item: string} | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [wasEverMember, setWasEverMember] = useState(false);
  const [currentUserMember, setCurrentUserMember] = useState<Member | null>(null);
  const [previousAccountAddress, setPreviousAccountAddress] = useState<string | null>(null);
  const [isAccountFluctuating, setIsAccountFluctuating] = useState(false);
  const [totalStakedTokens, setTotalStakedTokens] = useState<string | null>(null);
  const [userStakedTokens, setUserStakedTokens] = useState<string | null>(null);
  const [fetchingTokens, setFetchingTokens] = useState(false);
  const [stakingSupported, setStakingSupported] = useState<boolean | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const messageSubscriptionRef = useRef<{active: boolean; unsubscribe?: () => void}>({
    active: false
  });
  
  // Add refs to track effect states and prevent infinite loops
  const initialProfileRefreshRef = useRef(false);
  const refreshingMembersRef = useRef(false);
  const reconnectAttemptedRef = useRef(false); // Track if we've attempted reconnection
  
  // Add loading timeout to prevent infinite loading
  useEffect(() => {
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        if (!error) {
          setError("The chat room is taking too long to load. Please refresh the page.");
        }
      }
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(loadingTimeout);
  }, [loading, error]);
  
  // Add auto-reconnect effect
  useEffect(() => {
    // Only attempt reconnect once and only if wallet is not already connected
    if (!activeAccount?.address && !reconnectAttemptedRef.current) {
      reconnectAttemptedRef.current = true;
      
      // Check if we have a stored community membership
      const lastMemberAccount = localStorage.getItem('lastMemberAccount_' + communityId);
      const storedMemberStatus = sessionStorage.getItem('wasEverMember_' + communityId);
      
      if (lastMemberAccount && storedMemberStatus === 'true') {
        console.log("Found stored wallet for this community, attempting to prompt reconnection");
        
        // We can't directly reconnect, but we can set a flag in session to show it was attempted
        sessionStorage.setItem('reconnectAttempted_' + communityId, 'true');
        
        // We also update the UI state to show we're trying to reconnect
        setIsAccountFluctuating(true);
        
        // After a delay, if still not connected, show the proper disconnected state
        setTimeout(() => {
          if (!activeAccount?.address) {
            setIsAccountFluctuating(false);
          }
        }, 3000);
      }
    }
  }, [activeAccount?.address, communityId]);
  
  // Check if Firestore is properly initialized
  useEffect(() => {
    try {
      // Simple test query to see if Firestore is working
      const testRef = doc(db, "_test", "test");
      getDoc(testRef).then(() => {
      }).catch(err => {
        console.error("Firestore connection error:", err);
        setError("Error connecting to the chat database. Please try again later.");
      });
    } catch (err) {
      console.error("Firestore initialization error:", err);
      setError("Chat service is currently unavailable. Please try again later.");
    }
  }, []);
  
  // Function to refresh members list - with guard against infinite loops
  const refreshMembers = useCallback(async () => {
    if (!communityId) return;
    
    // Return immediately if we're already refreshing to prevent cascading refreshes
    if (refreshingMembersRef.current) {
      return;
    }
    
    try {
      refreshingMembersRef.current = true;
      // Create a Map to ensure unique members by wallet address
      const membersMap = new Map<string, Member>();
      
      // 1. First fetch from Firestore database
      const q = query(collection(db, "members"), where("communityId", "==", communityId));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.docs.forEach(doc => {
        const memberData = doc.data();
        const walletAddress = memberData.walletAddress.toLowerCase();
        membersMap.set(walletAddress, {
          id: doc.id,
          walletAddress: walletAddress, // Normalize wallet address
          displayName: memberData.displayName,
          avatarUrl: memberData.avatarUrl,
          joinedAt: memberData.joinedAt
        });
      });
      
      // 2. Ensure creator is included - but don't set a default displayName
      // so it can be overridden by profile data
      if (community?.creatorAddress) {
        const creatorAddress = community.creatorAddress.toLowerCase();
        if (!membersMap.has(creatorAddress)) {
          membersMap.set(creatorAddress, {
            id: 'creator',
            walletAddress: creatorAddress,
            // Don't set displayName here, will be set from profile or fallback later
            joinedAt: community.createdAt || new Date().toISOString()
          });
        }
      }
      
      // 3. Always fetch fresh profile data for each member (don't rely on cached data)
      const profilePromises = Array.from(membersMap.entries()).map(async ([walletAddress, member]) => {
        try {
          // Always get fresh profile data from Firestore
          const profileRef = doc(db, "communities", communityId, "profiles", walletAddress);
          const profileSnapshot = await getDoc(profileRef);
          
          if (profileSnapshot.exists()) {
            const profileData = profileSnapshot.data();
            if (profileData.displayName) {
              member.displayName = profileData.displayName;
            }
            // Use the correct property name 'avatar' from the profile data
            if (profileData.avatar) {
              member.avatarUrl = profileData.avatar;
              
              // Pre-load the image to check if it's valid
              const img = document.createElement('img');
              img.width = 40;
              img.height = 40;
              img.src = profileData.avatar;
              img.onload = () => {};
              img.onerror = () => {
                console.error(`Failed to pre-load avatar for ${walletAddress}, will use fallback`);
              };
            }
          }
          
          // If this is the creator and they don't have a profile name, use "Creator" as fallback
          if (community?.creatorAddress?.toLowerCase() === walletAddress && !member.displayName) {
            member.displayName = "Creator";
          }
          
          return member;
        } catch (err) {
          console.error(`Error fetching profile for member ${walletAddress}:`, err);
          
          // Still set creator fallback name if needed
          if (community?.creatorAddress?.toLowerCase() === walletAddress && !member.displayName) {
            member.displayName = "Creator";
          }
          
          return member; // Return original member if there's an error
        }
      });
      
      // Wait for all profile fetches to complete
      await Promise.all(profilePromises);
      
      // Convert Map to array
      const updatedMembersData = Array.from(membersMap.values());
      
      // Force UI update by creating a new array
      setMembers([...updatedMembersData]);
    } catch (err) {
      console.error("Error refreshing members:", err);
    } finally {
      // Always clear the refreshing flag when done
      refreshingMembersRef.current = false;
    }
  }, [communityId, community]);
  
  // Force refresh of avatars - useful when debugging avatar issues
  const forceRefreshAvatars = () => {
    console.log("Force refreshing avatars...");
    refreshMembers();
    
    // Also attempt to reload any broken avatar images
    setTimeout(() => {
      const avatarImages = document.querySelectorAll('img[alt="Avatar"]');
      console.log(`Found ${avatarImages.length} avatar images to refresh`);
      
      avatarImages.forEach((img, index) => {
        const imgElement = img as HTMLImageElement;
        const currentSrc = imgElement.src;
        
        // Only refresh URLs that aren't the default avatars
        if (!currentSrc.includes('dicebear')) {
          imgElement.src = `${currentSrc}?t=${Date.now()}`;
        }
      });
    }, 1000);
  };
  
  // Check if user has completed a profile for this community
  useEffect(() => {
    // Don't perform check if no active account or no community
    if (!activeAccount?.address || !communityId) {
      return;
    }
    
    // Skip if we've already checked
    if (profileChecked) {
      return;
    }
    
    // If we're not sure yet if user is a member (loading state), 
    // do a direct check to avoid waiting
    if (userStatus === 'loading' || userStatus === 'nonmember') {
      // First check if they're actually a member in the database
      const checkDirectMembership = async () => {
        try {
          const directMemberQuery = query(
            collection(db, "members"), 
            where("communityId", "==", communityId),
            where("walletAddress", "==", activeAccount.address.toLowerCase())
          );
          const directMemberSnapshot = await getDocs(directMemberQuery);
          
          if (directMemberSnapshot.empty) {
            return;
          }
          
          // If we get here, the user is a member, so check their profile
          checkProfile();
        } catch (err) {
          console.error("Error in direct membership check:", err);
        }
      };
      
      checkDirectMembership();
      return;
    }
    
    async function checkProfile() {
      try {
        // Check if user has a profile for this community
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount?.address || "");
        const profileSnapshot = await getDoc(profileRef);
        
        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data();
          
          // Explicitly check the isProfileComplete field
          if (profileData.isProfileComplete === true) {
            setProfileChecked(true);
            // Don't call refreshMembers directly here to avoid loops
            // The profile check completion will trigger the profile refresh effect
            return; // Exit early if profile is complete
          } else {
          }
        } else {
        }
        
        // If we reach here, the profile either doesn't exist or is not complete
        setShowProfileModal(true);
        
        setProfileChecked(true);
      } catch (err) {
        console.error("Error checking user profile:", err);
        // Don't block the user from using the chat if profile check fails
        setProfileChecked(true);
      }
    }
    
    // If user is a member, check their profile
    if (userStatus === 'member') {
      checkProfile();
    }
    
  }, [activeAccount?.address, communityId, userStatus, profileChecked]);
  
  // New effect to check if we're returning from profile setup
  useEffect(() => {
    // Use sessionStorage to check if we just returned from profile setup
    const returnedFromSetup = sessionStorage.getItem('returnedFromProfileSetup');
    
    if (returnedFromSetup === communityId && userStatus === 'member' && activeAccount?.address) {
      console.log("Detected return from profile setup, refreshing profile status");
      
      // Remove the flag
      sessionStorage.removeItem('returnedFromProfileSetup');
      
      // Reset profile check state
      setProfileChecked(false);
      
      // Refresh the members list
      refreshMembers();
    }
  }, [userStatus, communityId, activeAccount?.address, refreshMembers]);
  
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
    // First close the modal
    setShowProfileModal(false);
    
    // Set flag to detect returning from profile setup
    // This flag will be checked when the user returns to this page
    sessionStorage.setItem('returnedFromProfileSetup', communityId);
    console.log("Setting returnedFromProfileSetup flag:", communityId);
    
    // Then redirect to profile setup
    router.push(`/communities/${communityId}/profile/setup`);
  };

  // Fetch community data
  useEffect(() => {
    async function fetchCommunity() {
      try {
        const communityDoc = await getDoc(doc(db, "communities", communityId));
        if (communityDoc.exists()) {
          const communityData = { id: communityDoc.id, ...communityDoc.data() } as Community;
          setCommunity(communityData);
          
          // Fetch staked tokens if we have the contract address
          if (communityData.nftContractAddress) {
            fetchStakedTokens(communityData.nftContractAddress);
          }
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
  
  // Function to fetch staked tokens
  const fetchStakedTokens = async (contractAddress: string) => {
    try {
      setFetchingTokens(true);
      
      // Get the contract instance
      const contract = getContract({
        client,
        address: contractAddress,
        chain: baseSepolia,
      });
      
      // Check if contract supports staking functions before calling them
      let supportsStaking = false;
      try {
        // Try to call a simple view function to test if staking is implemented
        await readContract({
          contract,
          method: "function totalStakedTokens() view returns (uint256)",
          params: []
        });
        supportsStaking = true;
        setStakingSupported(true);
      } catch (error) {
        console.log("This contract does not support staking features", error);
        supportsStaking = false;
        setStakingSupported(false);
        // Set default values if staking is not supported
        setTotalStakedTokens("0");
        setUserStakedTokens("0");
        return; // Exit early if staking is not supported
      }
      
      if (supportsStaking) {
        // Fetch total staked tokens
        try {
          const stakedTokens = await readContract({
            contract,
            method: "function totalStakedTokens() view returns (uint256)",
            params: []
          });
          
          // Convert from wei to tokens with 2 decimal places for display
          const stakedTokensInEther = (Number(stakedTokens) / 1e18).toFixed(2);
          setTotalStakedTokens(stakedTokensInEther);
        } catch (stakedTokensError) {
          console.error("Error fetching total staked tokens:", stakedTokensError);
          // Set a default value to prevent UI from breaking
          setTotalStakedTokens("0");
        }
        
        // Fetch user's staked tokens if user is connected
        if (activeAccount?.address) {
          try {
            const userStaked = await readContract({
              contract,
              method: "function getStakedTokens(address) view returns (uint256)",
              params: [activeAccount.address]
            });
            
            // Convert from wei to tokens with 2 decimal places for display
            const userStakedInEther = (Number(userStaked) / 1e18).toFixed(2);
            setUserStakedTokens(userStakedInEther);
          } catch (userStakedError) {
            console.error("Error fetching user staked tokens:", userStakedError);
            // Set a default value to prevent UI from breaking
            setUserStakedTokens("0");
          }
        }
      }
    } catch (err) {
      console.error("Error fetching staked tokens:", err);
      // Set default values if the contract has issues
      setTotalStakedTokens("0");
      setUserStakedTokens("0");
      setStakingSupported(false);
    } finally {
      setFetchingTokens(false);
    }
  };
  
  // Refresh staked tokens when account changes
  useEffect(() => {
    if (community?.nftContractAddress && activeAccount?.address) {
      fetchStakedTokens(community.nftContractAddress);
    }
  }, [activeAccount?.address, community?.nftContractAddress]);
  
  // Handle account connection fluctuations
  useEffect(() => {
    // If we had an account but it's gone now, it might be a temporary fluctuation
    if (previousAccountAddress && !activeAccount?.address) {
      console.log("Account connection fluctuation detected - previous:", previousAccountAddress);
      
      // Mark that we're in a fluctuation state
      setIsAccountFluctuating(true);
      
      // Set a timeout to wait for connection to return before changing user status
      const fluctuationTimeout = setTimeout(() => {
        if (!activeAccount?.address) {
          console.log("Account connection not restored after timeout");
          setIsAccountFluctuating(false);
        }
      }, 5000); // 5 second grace period for connection to return
      
      return () => clearTimeout(fluctuationTimeout);
    }
    
    // If account is back after fluctuation, clear the fluctuation state
    if (isAccountFluctuating && activeAccount?.address) {
      console.log("Account connection restored:", activeAccount.address);
      setIsAccountFluctuating(false);
    }
    
    // Store the current account for future reference
    if (activeAccount?.address) {
      setPreviousAccountAddress(activeAccount.address);
    }
  }, [activeAccount?.address, previousAccountAddress, isAccountFluctuating]);
  
  // Fetch members and set user status
  useEffect(() => {
    async function fetchMembers() {
      try {
        console.log("Fetching members for community:", communityId);
        // Create a Map to ensure unique members by wallet address
        const membersMap = new Map<string, Member>();
        
        // 1. First fetch from Firestore database
        const q = query(collection(db, "members"), where("communityId", "==", communityId));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.docs.forEach(doc => {
          const memberData = doc.data();
          const walletAddress = memberData.walletAddress.toLowerCase();
          membersMap.set(walletAddress, {
            id: doc.id,
            walletAddress: walletAddress, // Normalize wallet address
            displayName: memberData.displayName,
            avatarUrl: memberData.avatarUrl,
            joinedAt: memberData.joinedAt
          });
        });
        
        console.log(`Found ${membersMap.size} members in the Firestore database`);
        
        // 2. Ensure creator is included
        if (community?.creatorAddress) {
          const creatorAddress = community.creatorAddress.toLowerCase();
          if (!membersMap.has(creatorAddress)) {
            console.log("Adding creator to members list");
            membersMap.set(creatorAddress, {
              id: 'creator',
              walletAddress: creatorAddress,
              joinedAt: community.createdAt || new Date().toISOString()
            });
          }
        }
        
        // 3. Enrich with profile data
        const profilePromises = Array.from(membersMap.entries()).map(async ([walletAddress, member]) => {
          try {
            // Always get fresh profile data from Firestore for better consistency
            const profileRef = doc(db, "communities", communityId, "profiles", walletAddress);
            const profileSnapshot = await getDoc(profileRef);
            
            if (profileSnapshot.exists()) {
              const profileData = profileSnapshot.data();
              if (profileData.displayName) {
                member.displayName = profileData.displayName;
                console.log(`Set display name for ${walletAddress}: ${profileData.displayName}`);
              }
              if (profileData.avatar) {
                member.avatarUrl = profileData.avatar;
                console.log(`Set avatar for ${walletAddress} from profile`);
              }
            }
            
            // If this is the creator and they don't have a profile name, use "Creator" as fallback
            if (community?.creatorAddress?.toLowerCase() === walletAddress && !member.displayName) {
              member.displayName = "Creator";
            }
            return member;
          } catch (err) {
            console.error(`Error fetching profile for member ${walletAddress}:`, err);
            // Continue with existing member data
            
            // Still set creator fallback name if needed
            if (community?.creatorAddress?.toLowerCase() === walletAddress && !member.displayName) {
              member.displayName = "Creator";
            }
            return member;
          }
        });
        
        await Promise.all(profilePromises);
        
        // Convert Map to array
        const updatedMembersData = Array.from(membersMap.values());
        console.log(`Final member count: ${updatedMembersData.length}`);
        setMembers(updatedMembersData);
        
        // 4. Check if current user is a member - with fluctuation handling
        if (activeAccount?.address) {
          console.log("Current user wallet:", activeAccount.address);
          const normalizedUserAddress = activeAccount.address.toLowerCase();
          
          // First check in the members map we've already loaded
          let isMember = membersMap.has(normalizedUserAddress);
          const isCreator = community?.creatorAddress?.toLowerCase() === normalizedUserAddress;
          
          // If not found in the map, do a direct database check
          // This handles the case of a user who just joined but the local members list hasn't updated yet
          if (!isMember && !isCreator) {
            try {
              console.log("Checking database directly for membership");
              const directMemberQuery = query(
                collection(db, "members"), 
                where("communityId", "==", communityId),
                where("walletAddress", "==", normalizedUserAddress)
              );
              const directMemberSnapshot = await getDocs(directMemberQuery);
              
              if (!directMemberSnapshot.empty) {
                console.log("User found as member in direct database check");
                isMember = true;
                
                // Add member to our local map for future use
                const memberDoc = directMemberSnapshot.docs[0];
                const memberData = memberDoc.data();
                
                const newMember = {
                  id: memberDoc.id,
                  walletAddress: normalizedUserAddress,
                  displayName: memberData.displayName,
                  avatarUrl: memberData.avatarUrl,
                  joinedAt: memberData.joinedAt
                };
                
                // Update the members state to include this member
                setMembers(prev => [...prev, newMember]);
              }
            } catch (err) {
              console.error("Error checking direct membership:", err);
            }
          }
          
          console.log("Membership check - Is member:", isMember, "Is creator:", isCreator);
          
          if (isMember || isCreator) {
            console.log("Setting user status to 'member'");
            setUserStatus('member');
            setWasEverMember(true);
            sessionStorage.setItem('wasEverMember_' + communityId, 'true');
            
            // Store the current account address in local storage for reconnection handling
            localStorage.setItem('lastMemberAccount_' + communityId, normalizedUserAddress);
          } else {
            console.log("Setting user status to 'nonmember'");
            setUserStatus('nonmember');
          }
        } else if (isAccountFluctuating) {
          // If we're in a fluctuation state, don't change the user status yet
          console.log("Account fluctuating, maintaining current user status:", userStatus);
        } else {
          console.log("No active account, can't determine membership");
          
          // Try to check if we have a stored member account address that matches this community
          const lastMemberAccount = localStorage.getItem('lastMemberAccount_' + communityId);
          const storedMemberStatus = sessionStorage.getItem('wasEverMember_' + communityId);
          
          if (lastMemberAccount && storedMemberStatus === 'true') {
            console.log("Detected previously verified member account:", lastMemberAccount);
            setWasEverMember(true);
          }
          
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
  
  // Fetch merchandise items
  useEffect(() => {
    async function fetchMerchandise() {
      if (!communityId) return;
      
      try {
        console.log("Fetching merchandise items for community:", communityId);
        const q = query(
          collection(db, "merchandise"), 
          where("communityId", "==", communityId),
          where("available", "==", true)
        );
        
        const querySnapshot = await getDocs(q);
        const merchandiseData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MerchandiseItem[];
        
        console.log(`Found ${merchandiseData.length} merchandise items for this community`);
        setMerchandise(merchandiseData);
      } catch (err) {
        console.error("Error fetching merchandise:", err);
        // Don't throw an error, just show empty state
      } finally {
        setMerchandiseLoading(false);
      }
    }
    
    fetchMerchandise();
  }, [communityId]);
  
  // Subscribe to messages - with improved stability
  useEffect(() => {
    // Don't wait for member status to be confirmed, just check if we're definitely not a member
    // Also skip subscription if we're in a fluctuation state to avoid unnecessary resubscribes
    if (userStatus === 'nonmember' && !wasEverMember) {
      return;
    }
    
    // If we already have an active subscription, don't create another one
    if (messageSubscriptionRef.current.active) {
      return;
    }
    
    console.log('Setting up message subscription for community:', communityId);
    let unsubscribe: () => void;
    let hasUnsubscribed = false;
    
    try {
      // First, create a simpler query that doesn't require a composite index
      // This avoids the "requires an index" error
      const q = query(
        collection(db, "messages"),
        where("communityId", "==", communityId)
        // No orderBy or limit to avoid requiring composite index
      );
      
      // Increase timeout to be more forgiving of slow connections
      const subscriptionTimeout = setTimeout(() => {
        console.log("Message subscription timeout reached - connection might be slow");
        if (!hasUnsubscribed && unsubscribe) {
          console.log("Canceling subscription attempt due to timeout");
          unsubscribe();
          hasUnsubscribed = true;
          
          // Set an error state but don't block the UI
          setError("Chat connection timed out. Messages may not update in real-time. Try refreshing the page.");
          setLoading(false);
        }
      }, 15000); // Increased from 5s to 15s for slower connections
      
      console.log("Initiating Firestore real-time listener for messages...");
      
      // Start with a one-time query to get messages faster
      getDocs(q).then((initialSnapshot) => {
        try {
          console.log(`Loaded ${initialSnapshot.docs.length} initial messages from Firestore`);
          
          // Process and display initial messages
          const initialMessages = initialSnapshot.docs.map(doc => {
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
          
          // Sort by timestamp (newest last for display) - do client-side sorting
          const sortedInitialMessages = initialMessages.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.timestamp?.toMillis() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
          });
          
          // Limit to most recent 50 messages client-side
          const limitedMessages = sortedInitialMessages.slice(-50);
          
          // Update state with initial messages
          setMessages(limitedMessages);
          setTimeout(() => scrollToBottom(), 100);
          setLoading(false);
          
          // Clear initial timeout since we have messages
          clearTimeout(subscriptionTimeout);
        } catch (err) {
          console.error("Error processing initial messages:", err);
        }
      }).catch(err => {
        console.error("Failed to load initial messages:", err);
      });
      
      // Then set up real-time listener for updates
      unsubscribe = onSnapshot(q, (querySnapshot) => {
        clearTimeout(subscriptionTimeout);
        setConnectionStatus('connected'); // Update connection status on successful connection
        messageSubscriptionRef.current.active = true;
        
        try {
          console.log(`Received ${querySnapshot.docs.length} messages from Firestore real-time update`);
          
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
          
          // Sort by timestamp (newest last for chat display)
          const sortedMessages = messagesData.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.timestamp?.toMillis() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeA - timeB;
          });
          
          // Limit to most recent 50 messages client-side
          const limitedMessages = sortedMessages.slice(-50);
          
          setMessages(limitedMessages);
          
          // Only scroll for new messages if we're already at the bottom
          const scrollContainer = document.querySelector('.overflow-y-auto');
          const isAtBottom = scrollContainer ? 
            (scrollContainer.scrollHeight - scrollContainer.scrollTop <= scrollContainer.clientHeight + 100) : 
            true;
            
          if (isAtBottom) {
            setTimeout(() => scrollToBottom(), 100);
          }
          
          // Messages loaded successfully
          setLoading(false);
        } catch (err) {
          console.error("Error processing messages:", err);
          setError("Error loading messages. Please refresh the page.");
          setConnectionStatus('error'); // Update connection status on error
          setLoading(false);
          messageSubscriptionRef.current.active = false;
        }
      }, (error) => {
        clearTimeout(subscriptionTimeout);
        console.error("Error fetching messages:", error);
        setError(`Failed to load messages: ${error.message}`);
        setConnectionStatus('error'); // Update connection status on error
        setLoading(false);
        messageSubscriptionRef.current.active = false;
      });
      
      // Store the unsubscribe function in our ref
      messageSubscriptionRef.current.unsubscribe = unsubscribe;
      messageSubscriptionRef.current.active = true;
      hasUnsubscribed = false;
    } catch (err) {
      console.error("Error setting up message listener:", err);
      setError("Could not connect to chat. Please refresh the page.");
      setConnectionStatus('error'); // Update connection status on error
      setLoading(false);
      messageSubscriptionRef.current.active = false;
    }
    
    return () => {
      console.log('Unsubscribing from message listener');
      if (unsubscribe && !hasUnsubscribed) {
        unsubscribe();
        hasUnsubscribed = true;
        messageSubscriptionRef.current.active = false;
      }
    };
  }, [communityId, userStatus, wasEverMember]); // Remove members dependency to avoid resubscribing
  
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
  
  // Handle sending message with updated profile information
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !activeAccount?.address) return;
    
    // First, ensure the user is really a member even if the UI hasn't caught up
    if (userStatus !== 'member') {
      try {
        // Do a direct membership check
        const directMemberQuery = query(
          collection(db, "members"),
          where("communityId", "==", communityId),
          where("walletAddress", "==", activeAccount.address.toLowerCase())
        );
        const directMemberSnapshot = await getDocs(directMemberQuery);
        
        if (directMemberSnapshot.empty) {
          console.log("User tried to send message but is not a member");
          setMessageError("You must be a member of this community to send messages.");
          return;
        } else {
          // User is a member but state hasn't updated yet
          console.log("User is a member but state hasn't updated - continuing with message");
          // Update the state so future checks are faster
          setUserStatus('member');
        }
      } catch (err) {
        console.error("Error checking membership before sending:", err);
        setMessageError("Could not verify your membership. Please try again.");
        return;
      }
    }
    
    // Check if profile has been checked yet, and force a profile check
    if (!profileChecked) {
      try {
        // Always check profile before sending
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
        const profileSnapshot = await getDoc(profileRef);
        
        if (!profileSnapshot.exists() || !profileSnapshot.data().isProfileComplete) {
          console.log("User needs to complete profile before sending messages");
          setShowProfileModal(true);
          return;
        }
        
        // If we get here, the profile is complete
        setProfileChecked(true);
      } catch (err) {
        console.error("Error checking profile before sending message:", err);
        // Continue with sending attempt
      }
    }
    
    setMessageError(null);
    setSendingMessage(true);
    const messageText = newMessage; // Store message for retry
    
    // Check if current user is the creator
    const isCreator = community?.creatorAddress?.toLowerCase() === activeAccount?.address?.toLowerCase();
    
    try {
      // First refresh member list to ensure latest profile data
      await refreshMembers();
      
      // Find member info for the sender
      const senderMember = members.find(
        member => member.walletAddress.toLowerCase() === activeAccount.address.toLowerCase()
      );
      
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
          } else {
          }
        } else {
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
      } else {
        // Add default avatar URL using DiceBear API
        messageData.senderAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`;
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
  
  // Handle merchandise item redemption
  const handleRedeem = (item: MerchandiseItem) => {
    // Set the redemption message
    setRedeemMsg({
      show: true,
      item: item.name
    });
    
    // Hide the message after 3 seconds
    setTimeout(() => {
      setRedeemMsg(null);
    }, 3000);
    
    console.log(`Attempted to redeem ${item.name} for ${item.pointsCost} points`);
  };
  
  // Additional effect to refresh members list when profile status changes - with guards
  useEffect(() => {
    if (profileChecked && userStatus === 'member' && activeAccount?.address && !refreshingMembersRef.current) {
      console.log("Profile check completed, refreshing members list to update names");
      refreshMembers();
    }
  }, [profileChecked, userStatus, activeAccount?.address, refreshMembers]);

  // New effect to ensure profile data is refreshed on page load - with ref guard
  useEffect(() => {
    if (community && activeAccount?.address && userStatus === 'member' && !initialProfileRefreshRef.current && !refreshingMembersRef.current) {
      console.log("Initial profile refresh on page load");
      initialProfileRefreshRef.current = true;
      refreshMembers();
    }
  }, [community, activeAccount?.address, userStatus, refreshMembers]);
  
  // Update current user member data whenever members change - with optimization
  useEffect(() => {
    if (members.length > 0 && activeAccount?.address) {
      const foundMember = members.find(m => 
        m.walletAddress.toLowerCase() === activeAccount.address.toLowerCase()
      );
      
      if (foundMember && (
        // Only update if the data has actually changed to prevent loops
        !currentUserMember || 
        foundMember.displayName !== currentUserMember.displayName ||
        foundMember.avatarUrl !== currentUserMember.avatarUrl
      )) {
        console.log("Updated current user member data:", foundMember);
        setCurrentUserMember(foundMember);
      }
    }
  }, [members, activeAccount?.address, currentUserMember]);

  // Persist member status for UI stability
  useEffect(() => {
    if (userStatus === 'member') {
      console.log("User confirmed as member, setting wasEverMember flag");
      setWasEverMember(true);
      
      // Store in sessionStorage as backup
      sessionStorage.setItem('wasEverMember_' + communityId, 'true');
    }
  }, [userStatus, communityId]);

  // Restore member status from session storage on initial load
  useEffect(() => {
    const storedMemberStatus = sessionStorage.getItem('wasEverMember_' + communityId);
    if (storedMemberStatus === 'true' && !wasEverMember) {
      console.log("Restoring member status from session storage");
      setWasEverMember(true);
    }
  }, [communityId, wasEverMember]);
  
  // Add a function to retry connection
  const retryConnection = () => {
    console.log("Manually retrying connection...");
    setConnectionStatus('connecting');
    setError(null);
    
    // Force reload messages subscription by changing a dependency
    // This will trigger the useEffect for message subscription
    setUserStatus('loading');
    setTimeout(() => {
      // Set back to member after a small delay
      if (activeAccount?.address) {
        const isCreator = community?.creatorAddress?.toLowerCase() === activeAccount.address.toLowerCase();
        const isMember = members.some(m => m.walletAddress.toLowerCase() === activeAccount.address.toLowerCase());
        
        if (isCreator || isMember) {
          setUserStatus('member');
        } else {
          setUserStatus('nonmember');
        }
      } else {
        setUserStatus('nonmember');
      }
    }, 100);
  };
  
  // Create a helper function to get the most current display name for a wallet address
  const getCurrentDisplayName = (walletAddress: string): string => {
    if (!walletAddress) return 'Unknown';
    
    // Normalize the wallet address
    const normalizedAddress = walletAddress.toLowerCase();
    
    // First check in the latest members list
    const member = members.find(m => m.walletAddress.toLowerCase() === normalizedAddress);
    if (member?.displayName) {
      return member.displayName;
    }
    
    // Check if this is the creator
    if (community?.creatorAddress?.toLowerCase() === normalizedAddress) {
      return 'Creator';
    }
    
    // Fall back to shortened wallet address
    return normalizedAddress.substring(0, 6) + '...';
  };

  // Separate effect to update messages with latest member data without resubscribing
  useEffect(() => {
    if (members.length === 0 || messages.length === 0) return;
    
    // Don't log on every render to avoid console spam
    if (process.env.NODE_ENV === 'development') {
      console.log("Members list updated, updating message display names");
    }
    
    // Force message component re-render by recreating the messages array
    // Use a ref to prevent this from running on every render
    const needsUpdate = messages.some(message => {
      const displayName = getCurrentDisplayName(message.senderAddress);
      return displayName !== message.cachedDisplayName;
    });
    
    if (needsUpdate) {
      setMessages(prevMessages => 
        prevMessages.map(message => ({
          ...message,
          cachedDisplayName: getCurrentDisplayName(message.senderAddress)
        }))
      );
    }
  }, [members, getCurrentDisplayName, messages]);
  
  // Handle user typing in the message input field
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setNewMessage(newValue);
    
    // Only do checks when they start typing (empty → non-empty)
    if (newValue.trim() !== '' && newMessage.trim() === '' && activeAccount?.address) {
      console.log("User started typing, checking membership and profile status");
      
      // If status is not member, check directly in the database
      if (userStatus !== 'member') {
        try {
          const directMemberQuery = query(
            collection(db, "members"),
            where("communityId", "==", communityId),
            where("walletAddress", "==", activeAccount.address.toLowerCase())
          );
          const directMemberSnapshot = await getDocs(directMemberQuery);
          
          if (!directMemberSnapshot.empty) {
            console.log("User is a member but state hasn't updated yet");
            setUserStatus('member');
            
            // Now check profile
            const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
            const profileSnapshot = await getDoc(profileRef);
            
            if (!profileSnapshot.exists() || !profileSnapshot.data().isProfileComplete) {
              console.log("New member needs to complete profile");
              setShowProfileModal(true);
            } else {
              setProfileChecked(true);
            }
          }
        } catch (err) {
          console.error("Error checking membership when typing:", err);
        }
      }
      // If we're already a member but profile hasn't been checked
      else if (!profileChecked) {
        try {
          const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
          const profileSnapshot = await getDoc(profileRef);
          
          if (!profileSnapshot.exists() || !profileSnapshot.data().isProfileComplete) {
            console.log("Member needs to complete profile before sending messages");
            setShowProfileModal(true);
          } else {
            setProfileChecked(true);
          }
        } catch (err) {
          console.error("Error checking profile when typing:", err);
        }
      }
    }
  };
  
  // Check for new members that need profile setup immediately on page load
  useEffect(() => {
    if (!activeAccount?.address || !communityId || userStatus === 'member' || profileChecked) {
      return;
    }

    const checkNewMember = async () => {
      console.log("Checking if user is a new member that needs profile setup");
      try {
        // Check if the user is a member in the database directly
        const directMemberQuery = query(
          collection(db, "members"),
          where("communityId", "==", communityId),
          where("walletAddress", "==", activeAccount.address.toLowerCase())
        );
        const directMemberSnapshot = await getDocs(directMemberQuery);
        
        if (directMemberSnapshot.empty) {
          console.log("User is not a member according to direct database check");
          return;
        }
        
        console.log("User is a new member, updating status");
        setUserStatus('member');
        
        // Check if they have a completed profile
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
        const profileSnapshot = await getDoc(profileRef);
        
        if (!profileSnapshot.exists() || !profileSnapshot.data().isProfileComplete) {
          console.log("New member needs to complete profile, showing modal");
          setTimeout(() => setShowProfileModal(true), 1000); // Delay to let UI stabilize
        } else {
          console.log("New member already has a complete profile");
          setProfileChecked(true);
        }
      } catch (err) {
        console.error("Error checking new member status:", err);
      }
    };
    
    // Run with a slight delay to allow other initializations to complete
    const timerId = setTimeout(checkNewMember, 1500);
    return () => clearTimeout(timerId);
  }, [activeAccount?.address, communityId, userStatus, profileChecked]);
  
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
          <div className="text-sm text-zinc-500">Contract: {community?.nftContractAddress ? 
            `${community.nftContractAddress.substring(0, 6)}...${community.nftContractAddress.substring(community.nftContractAddress.length - 4)}` : 
            'No contract address'}</div>
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
        
        {/* Staked Tokens Section */}
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2 flex justify-between items-center">
            <span>Staked Tokens</span>
            {community?.nftContractAddress && (
              <button 
                onClick={() => fetchStakedTokens(community.nftContractAddress)} 
                className="text-xs text-zinc-400 hover:text-[#008CFF]"
                title="Refresh staked tokens"
                disabled={fetchingTokens}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${fetchingTokens ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
          
          <div className="bg-white border border-gray-200 rounded-md p-3">
            {stakingSupported === false ? (
              <div className="text-sm text-zinc-500 text-center py-1">
                Staking not available for this community
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-600">Total Staked:</span>
                  {fetchingTokens ? (
                    <div className="animate-pulse h-4 w-16 bg-gray-200 rounded"></div>
                  ) : (
                    <span className="text-sm font-medium">{totalStakedTokens || '0'} $GROW</span>
                  )}
                </div>
                
                {activeAccount?.address && userStakedTokens && Number(userStakedTokens) > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-sm text-zinc-600">Your Stake:</span>
                    {fetchingTokens ? (
                      <div className="animate-pulse h-4 w-16 bg-gray-200 rounded"></div>
                    ) : (
                      <span className="text-sm font-medium">{userStakedTokens} $GROW</span>
                    )}
                  </div>
                )}
                
                {/* Add Manage Stake link */}
                {/* {activeAccount?.address && userStatus === 'member' && stakingSupported && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <Link href={`/communities/${communityId}`} className="text-xs text-[#008CFF] hover:underline">
                      Manage your stake →
                    </Link>
                  </div>
                )} */}
              </>
            )}
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
              Jun 25, 2025 - 7:00 PM UTC
            </div>
          </div>
        </div>
        
        {/* Exclusive Merch Section */}
        <div className="mb-6">
          <div className="text-xs uppercase text-zinc-500 font-medium mb-2">Exclusive Items</div>
          <div className="space-y-3">
            {merchandiseLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin h-5 w-5 border-2 border-[#008CFF] border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-xs text-zinc-500">Loading merchandise...</p>
              </div>
            ) : merchandise.length > 0 ? (
              merchandise.map((item) => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-md p-3">
                  <div className="h-20 bg-gray-100 rounded-md mb-2 overflow-hidden">
                    <Image 
                      src={item.imageUrl} 
                      alt={item.name} 
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-medium mb-1">{item.name}</div>
                  {item.description && <div className="text-xs text-zinc-600 mb-2">{item.description}</div>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-600">{item.pointsCost} POINTS</span>
                    <button 
                      onClick={() => handleRedeem(item)} 
                      className="text-xs bg-[#008CFF] text-white px-2 py-1 rounded hover:bg-[#0070CC]"
                    >
                      Redeem
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-gray-50 p-4 text-center rounded-md">
                <p className="text-sm text-zinc-500">No items are available to redeem yet.</p>
              </div>
            )}
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
          <div className="flex items-center">
            {/* Add wallet connection status indicator */}
            <div className={`h-2.5 w-2.5 rounded-full mr-1.5 ${
              activeAccount?.address ? 'bg-green-500' : 
              isAccountFluctuating ? 'bg-yellow-500 animate-pulse' : 
              'bg-gray-500'
            }`}></div>
            <span className="text-xs text-zinc-500 mr-4">
              {activeAccount?.address ? 'Wallet Connected' : 
               isAccountFluctuating ? 'Reconnecting...' : 
               'Wallet Disconnected'}
            </span>
            
            {/* Add Reconnect button when wallet is disconnected */}
            {!activeAccount?.address && !isAccountFluctuating && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    // Create a refresh URL that preserves our current page
                    const url = new URL(window.location.href);
                    // Add a timestamp parameter to force a refresh
                    url.searchParams.set('refresh', Date.now().toString());
                    window.location.href = url.toString();
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  Refresh
                </button>
                <div className="ml-2">
                  <ConnectButton
                    client={require("../../../client").client}
                    appMetadata={{
                      name: "Collabr",
                      url: "https://collabr.xyz",
                    }}
                  />
                </div>
              </div>
            )}
            
            <div className={`h-2.5 w-2.5 rounded-full mr-1.5 ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`}></div>
            <span className="text-xs text-zinc-500">
              {connectionStatus === 'connected' ? 'Community Connected' : 
               connectionStatus === 'connecting' ? 'Connecting...' : 
               'Connection Error'}
            </span>
            {connectionStatus === 'error' && (
              <button 
                onClick={retryConnection}
                className="ml-2 text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Retry
              </button>
            )}
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
                  {(() => {
                    // Find the member in the members list to get their current avatar
                    const messageSender = members.find(m => 
                      m.walletAddress.toLowerCase() === message.senderAddress.toLowerCase()
                    );
                    
                    // Use the member's current avatar if available, otherwise fall back to the message avatar
                    const currentAvatar = messageSender?.avatarUrl || message.senderAvatar;
                    
                    return currentAvatar ? (
                      <Image 
                        src={currentAvatar} 
                        alt="Avatar" 
                        width={40}
                        height={40}
                        className="w-full h-full object-cover" 
                        onLoadingComplete={() => {}}
                        onError={(e) => {
                          console.error(`Failed to load message avatar for ${message.senderAddress}:`, currentAvatar);
                          // Fall back to default avatar URL
                          const fallbackUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${message.senderAddress}`;
                          setMessages(prev => prev.map(msg => 
                            msg.id === message.id 
                              ? {...msg, senderAvatar: fallbackUrl} 
                              : msg
                          ));
                        }}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${message.isCreator ? 'bg-[#008CFF]' : 'bg-gray-200'} ${message.isCreator ? 'text-white' : 'text-zinc-600'}`}>
                        <Image 
                          src={`https://api.dicebear.com/7.x/identicon/svg?seed=${message.senderAddress}`}
                          alt="Default Avatar" 
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If even the default fails, we'll just show fallback text
                            const firstChar = message.senderName?.[0] || message.senderAddress[0] || '?';
                            const div = document.createElement('div');
                            div.textContent = firstChar;
                            div.className = 'flex items-center justify-center w-full h-full';
                            
                            // Find the parent container and replace the image with the text div
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = '';
                              parent.appendChild(div);
                            }
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline">
                    <span className={`font-medium ${message.isCreator ? 'text-[#008CFF]' : 'text-zinc-900'}`}>
                      {/* Always get the current display name using our helper function */}
                      {getCurrentDisplayName(message.senderAddress)}
                    </span>
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
              onChange={handleInputChange}
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
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase text-zinc-500 font-medium">
            Members — {members.length}
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={() => refreshMembers()}
              className="text-xs text-zinc-500 hover:text-[#008CFF] flex items-center"
              title="Refresh member list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span>List</span>
            </button>
            <button 
              onClick={() => forceRefreshAvatars()}
              className="text-xs text-zinc-500 hover:text-[#008CFF] flex items-center"
              title="Refresh avatars"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.5-9c0-.276-.224-.5-.5-.5s-.5.224-.5.5h1zm0 3.5c0 .276-.224.5-.5.5s-.5-.224-.5-.5h1zm-1-7c0-.276.224-.5.5-.5s.5.224.5.5h-1zm1.5.5A.5.5 0 0010 6a.5.5 0 00-.5.5h1zm-2 0a.5.5 0 00.5-.5.5.5 0 00-.5-.5v1zm3 0a.5.5 0 00-.5-.5.5.5 0 00-.5.5h1zm-2.5-2a.5.5 0 00-.5.5.5.5 0 00.5.5V4zM7 8a.5.5 0 00.5.5.5.5 0 00.5-.5H7zm0 0a.5.5 0 00.5-.5.5.5 0 00-.5-.5v1zm3 0a.5.5 0 00-.5-.5.5.5 0 00-.5.5h1zm-5.5-3a.5.5 0 01.5-.5h3a.5.5 0 010 1H5a.5.5 0 01-.5-.5zm5.5 0a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z" />
              </svg>
              <span>Avatars</span>
            </button>
          </div>
        </div>

        {/* Current user profile card */}
        {(activeAccount?.address && (userStatus === 'member' || wasEverMember)) && (
          <div className="bg-white rounded-md p-3 mb-4 border border-gray-200">
            <div className="flex items-center">
              {/* Get current user info from members */}
              {(() => {
                // Try to use currentUserMember state first if available
                const currentMember = currentUserMember || members.find(m => 
                  m.walletAddress.toLowerCase() === activeAccount.address.toLowerCase()
                );
                const isCreator = community?.creatorAddress?.toLowerCase() === activeAccount.address.toLowerCase();
                
                // Add debug status indicators (only visible in development)
                const debugStatus = process.env.NODE_ENV === 'development' ? (
                  <div className="text-xs text-gray-400 mt-1">
                    Status: {userStatus}, Ever Member: {wasEverMember ? 'Yes' : 'No'}
                  </div>
                ) : null;
                
                return (
                  <>
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden mr-3">
                      {currentMember?.avatarUrl ? (
                        <Image 
                          src={currentMember.avatarUrl} 
                          alt="Your Avatar" 
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          onLoadingComplete={() => {}}
                          onError={(e) => {
                            console.error(`Failed to load avatar image for ${currentMember.walletAddress}:`, currentMember.avatarUrl);
                            // Fall back to default avatar
                            const fallbackUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${currentMember.walletAddress}`;
                            if (currentUserMember) {
                              setCurrentUserMember({
                                ...currentUserMember,
                                avatarUrl: fallbackUrl
                              });
                            }
                          }}
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${isCreator ? 'bg-[#008CFF]' : 'bg-gray-200'} ${isCreator ? 'text-white' : 'text-zinc-600'}`}>
                          <Image 
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${currentMember?.walletAddress || activeAccount.address}`}
                            alt="Default Avatar" 
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Display initials as fallback
                              const firstChar = currentMember?.displayName?.[0] || currentMember?.walletAddress[0] || '?';
                              const div = document.createElement('div');
                              div.textContent = firstChar;
                              div.className = 'flex items-center justify-center w-full h-full';
                              
                              // Find the parent container and replace the image with the text div
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = '';
                                parent.appendChild(div);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {currentMember?.displayName || currentMember?.walletAddress.substring(0, 6) + '...'}
                        {isCreator && (
                          <span className="ml-2 text-xs bg-blue-50 text-[#008CFF] px-1.5 py-0.5 rounded">Host</span>
                        )}
                      </div>
                      {userStakedTokens && stakingSupported && Number(userStakedTokens) > 0 && (
                        <div className="text-xs text-zinc-500 mt-1">
                          Staked: {userStakedTokens} $GROW
                        </div>
                      )}
                      {debugStatus}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
        
        <div className="text-xs uppercase text-zinc-500 font-medium mb-2">
          Community Members
        </div>
        <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">{/* Adjust height to account for profile card */}
          {members.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-4">
              No members found
            </div>
          ) : (
            members.map((member) => {
              const isCreator = community?.creatorAddress?.toLowerCase() === member.walletAddress.toLowerCase();
              return (
                <div key={member.id} className="flex items-center bg-white hover:bg-gray-100 rounded-md p-2 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden mr-2">
                    {member.avatarUrl ? (
                      <Image 
                        src={member.avatarUrl} 
                        alt="Avatar" 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover" 
                        onLoadingComplete={() => {}}
                        onError={(e) => {
                          console.error(`Failed to load avatar image for ${member.walletAddress}:`, member.avatarUrl);
                          // Update with fallback avatar URL
                          const fallbackUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${member.walletAddress}`;
                          setMembers(prev => prev.map(m => 
                            m.id === member.id 
                              ? {...m, avatarUrl: fallbackUrl} 
                              : m
                          ));
                        }}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${isCreator ? 'bg-[#008CFF]' : 'bg-gray-200'} ${isCreator ? 'text-white' : 'text-zinc-600'}`}>
                        <Image 
                          src={`https://api.dicebear.com/7.x/identicon/svg?seed=${member.walletAddress}`}
                          alt="Default Avatar" 
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Display initials as fallback
                            const firstChar = member.displayName?.[0] || member.walletAddress[0] || '?';
                            const div = document.createElement('div');
                            div.textContent = firstChar;
                            div.className = 'flex items-center justify-center w-full h-full';
                            
                            // Find the parent container and replace the image with the text div
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = '';
                              parent.appendChild(div);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <div className="flex items-center">
                      <div className="text-sm font-medium truncate">
                        {member.displayName ? (
                          // Show profile name with a special style
                          <span className="text-[#008CFF]">{member.displayName}</span>
                        ) : (
                          // Default to wallet address if no profile name
                          member.walletAddress.substring(0, 6) + '...'
                        )}
                      </div>
                      {isCreator && (
                        <span className="ml-2 text-xs bg-blue-50 text-[#008CFF] px-1.5 py-0.5 rounded">Host</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      Joined: {new Date(member.joinedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Profile completion modal - outside the flex layout */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button 
              onClick={() => {
                setShowProfileModal(false);
                // Set flag to detect returning from profile setup
                sessionStorage.setItem('returnedFromProfileSetup', communityId);
              }}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            
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
              <p><strong>Note:</strong> Once your profile is created, it cannot be changed in the future. Please choose your display name and avatar carefully.</p>
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

      {/* Redemption toast notification */}
      {redeemMsg && redeemMsg.show && (
        <div className="fixed bottom-5 right-5 bg-[#008CFF] text-white px-4 py-3 rounded-md shadow-lg animate-fadeIn">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium">Coming Soon!</p>
              <p className="text-sm opacity-90">Redemption for {redeemMsg.item} will be available soon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
