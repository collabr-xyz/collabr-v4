"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "../../../../client";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, query, getDocs, collection, where, writeBatch, addDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
    farcaster?: string;
  };
  customFields?: { [key: string]: string };
}

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

export default function ProfileSetup() {
  const router = useRouter();
  const params = useParams();
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityProfile, setCommunityProfile] = useState<CommunityProfile | null>(null);
  const [customAvatarFile, setCustomAvatarFile] = useState<File | null>(null);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);

  // Fetch community and user profile data
  useEffect(() => {
    if (!communityId || !activeAccount) return;

    async function fetchData() {
      setIsLoading(true);
      try {
        // Remove edit mode handling since profiles can't be edited
        if (sessionStorage.getItem('profileEditMode') === 'true') {
          console.log("Edit mode detected but profiles cannot be edited. Clearing flag.");
          sessionStorage.removeItem('profileEditMode');
        }
        
        // Fetch community data
        const communityRef = doc(db, "communities", communityId);
        const communitySnapshot = await getDoc(communityRef);
        
        if (!communitySnapshot.exists()) {
          setErrorMessage("Community not found");
          setIsLoading(false);
          return;
        }
        
        const communityData = {
          id: communitySnapshot.id,
          ...communitySnapshot.data()
        } as Community;
        setCommunity(communityData);
        
        // Fetch user profile for this community if it exists
        const profileRef = doc(db, "communities", communityId, "profiles", activeAccount?.address || "");
        const profileSnapshot = await getDoc(profileRef);
        
        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data() as CommunityProfile;
          setCommunityProfile(profileData);
          
          // If user already has a complete profile, redirect to community room
          // Profiles cannot be edited once created
          if (profileData.isProfileComplete) {
            console.log("User already has a complete profile. Redirecting to room.");
            // Show message before redirecting
            setErrorMessage("Profiles cannot be edited once created. Redirecting to community room...");
            
            setTimeout(() => {
              router.push(`/communities/${communityId}/room`);
            }, 2000);
            
            return;
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setErrorMessage("Failed to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [communityId, activeAccount, router]);

  // Handle avatar file selection
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (!file.type.startsWith('image/')) {
        setErrorMessage("Please select an image file");
        return;
      }
      
      setCustomAvatarFile(file);
      
      try {
        const storage = getStorage();
        const storageRef = ref(storage, `communities/${communityId}/profiles/${activeAccount?.address}/${Date.now()}_${file.name}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        setCustomAvatarUrl(downloadURL);
      } catch (error) {
        console.error("Error uploading avatar:", error);
        setErrorMessage("Failed to upload avatar. Please try again.");
      }
    }
  };

  // Handle profile save
  const handleProfileSave = async (profileData: Partial<CommunityProfile>) => {
    if (!activeAccount || !communityId) return;
    
    try {
      const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
      
      // Ensure isProfileComplete is explicitly set to true
      const profileToSave: CommunityProfile = {
        userId: activeAccount.address,
        communityId: communityId,
        displayName: profileData.displayName || activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        joinedAt: communityProfile?.joinedAt || serverTimestamp(),
        isProfileComplete: true, // Explicitly set to true
        bio: profileData.bio || "",
        avatar: profileData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
        socialLinks: profileData.socialLinks || {},
        // Preserve any existing fields
        ...(communityProfile || {}),
        // But override with new values
        ...profileData,
      };
      
      // Make sure isProfileComplete wasn't overridden
      profileToSave.isProfileComplete = true;
      
      console.log("Saving profile with isProfileComplete=true:", profileToSave);
      
      // Use set with merge option instead of updateDoc to ensure all fields are saved properly
      await setDoc(profileRef, profileToSave as { [x: string]: any }, { merge: true });
      
      // Check if avatar was updated
      const avatarChanged = profileData.avatar && (!communityProfile?.avatar || profileData.avatar !== communityProfile.avatar);
      
      if (avatarChanged) {
        try {
          console.log("Avatar changed, updating sender avatar in previous messages...");
          
          // Create a query to find all messages from this user in this community
          const messagesQuery = query(
            collection(db, "messages"),
            where("communityId", "==", communityId),
            where("senderAddress", "==", activeAccount.address)
          );
          
          // Get all messages from this user
          const messagesSnapshot = await getDocs(messagesQuery);
          
          // Batch updates for better performance
          const batch = writeBatch(db);
          let updateCount = 0;
          
          messagesSnapshot.forEach((messageDoc) => {
            // Update senderAvatar field in each message
            batch.update(messageDoc.ref, {
              senderAvatar: profileData.avatar,
              senderName: profileData.displayName || messageDoc.data().senderName // Also update name if provided
            });
            updateCount++;
          });
          
          // Commit the batch if there are updates
          if (updateCount > 0) {
            await batch.commit();
            console.log(`Updated avatar in ${updateCount} previous messages`);
          }
        } catch (error) {
          console.error("Failed to update avatar in previous messages:", error);
          // Continue with profile update even if message update fails
        }
      }
      
      // Update local state
      setCommunityProfile(profileToSave);
      
      // Also update the member record in the members collection
      try {
        // Check if a member record exists for this user
        const membersQuery = query(
          collection(db, "members"),
          where("communityId", "==", communityId),
          where("walletAddress", "==", activeAccount.address.toLowerCase())
        );
        
        const memberSnapshot = await getDocs(membersQuery);
        
        if (!memberSnapshot.empty) {
          // Update existing member record
          const memberDoc = memberSnapshot.docs[0];
          await updateDoc(memberDoc.ref, {
            displayName: profileData.displayName || activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
            avatarUrl: profileData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`
          });
          console.log("Updated member record with new profile data");
        } else {
          // Create new member record if it doesn't exist
          await addDoc(collection(db, "members"), {
            communityId: communityId,
            walletAddress: activeAccount.address.toLowerCase(),
            displayName: profileData.displayName || activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
            avatarUrl: profileData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`,
            joinedAt: new Date().toISOString()
          });
          console.log("Created new member record with profile data");
        }
      } catch (error) {
        console.error("Failed to update member record:", error);
        // Continue anyway since the profile was saved
      }
      
      // Set flag to indicate profile was just updated
      sessionStorage.setItem('returnedFromProfileSetup', communityId);
      console.log('Set returnedFromProfileSetup flag in sessionStorage');
      
      // Redirect to community room
      router.push(`/communities/${communityId}/room`);
    } catch (error) {
      console.error("Error saving profile:", error);
      setErrorMessage("Failed to save profile. Please try again.");
    }
  };

  if (!activeAccount) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
          <div className="text-center py-12 border border-zinc-100 rounded-lg">
            <h2 className="text-xl font-medium mb-4">Connect Your Wallet</h2>
            <p className="text-zinc-500 mb-6">You need to connect your wallet to set up your profile</p>
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Collabr",
                url: "https://collabr.xyz",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium">
              Create Your Community Profile
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {community?.name ? `for ${community.name}` : ''}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {errorMessage}
          </div>
        )}

        <div className="bg-white border border-zinc-200 rounded-lg p-6 mb-6">
          <div className="text-sm text-gray-600 mb-6">
            {community?.name 
              ? <p>Welcome to <span className="font-medium">{community.name}</span>! Please set up your profile for this community. This profile will only be visible within this community.</p>
              : "Set up your profile for this community. This profile will only be visible within this community."
            }
          </div>
          
          <div className="bg-yellow-50 text-yellow-800 p-4 rounded-md mb-6 text-sm flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <strong>Profile Required:</strong> You must complete your profile before you can participate in this community. This helps build trust and recognition among community members.
            </div>
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
            
            // Set avatar based on whether a custom avatar was uploaded
            if (customAvatarUrl) {
              profileData.avatar = customAvatarUrl;
            } else {
              // Ensure it's a properly formatted URL
              profileData.avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`;
            }
            
            handleProfileSave(profileData);
          }} className="space-y-6">
            {/* Avatar Selection */}
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Profile Avatar
              </label>
              
              <div className="flex items-start">
                <div className="flex items-center space-x-3">
                  {/* Current avatar display */}
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200">
                    {customAvatarFile ? (
                      <Image
                        src={URL.createObjectURL(customAvatarFile)}
                        alt="Custom avatar preview"
                        width={48}
                        height={48}
                        className="object-cover"
                      />
                    ) : communityProfile?.avatar && !communityProfile.avatar.includes('dicebear') ? (
                      <Image
                        src={communityProfile.avatar}
                        alt="Current avatar"
                        width={48}
                        height={48}
                        className="object-cover"
                      />
                    ) : (
                      <div className="bg-blue-100 w-full h-full flex items-center justify-center">
                        <img
                          src={`https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount?.address}`}
                          alt="Default avatar"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Upload button */}
                  <div>
                    <label 
                      htmlFor="avatarUpload"
                      className="cursor-pointer inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {customAvatarFile || (communityProfile?.avatar && !communityProfile.avatar.includes('dicebear')) 
                        ? 'Change Image' 
                        : 'Upload Custom Image'}
                    </label>
                    {(customAvatarFile || (communityProfile?.avatar && !communityProfile.avatar.includes('dicebear'))) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomAvatarFile(null);
                          setCustomAvatarUrl(null);
                        }}
                        className="ml-2 text-xs text-red-500 hover:text-red-700"
                      >
                        Reset to Default
                      </button>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Default avatar will be used if no image is uploaded
                    </p>
                  </div>
                </div>
                
                <input
                  type="file"
                  id="avatarUpload"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                
                {/* Hidden field to track avatar type */}
                <input 
                  type="hidden" 
                  name="avatarType" 
                  value={customAvatarUrl ? 'custom' : 'default'} 
                />
              </div>
            </div>

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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                required
              />
            </div>
            
            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                defaultValue={communityProfile?.bio || ''}
                placeholder="Tell others about yourself..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              />
            </div>
            
            {/* Social Links */}
            <div className="border-t border-gray-200 pt-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Social Links (Optional)</h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="twitter" className="block text-sm text-gray-700 mb-1">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2 text-[#1DA1F2]">
                        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.937 4.937 0 004.604 3.417 9.868 9.868 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.054 0 13.999-7.496 13.999-13.986 0-.209 0-.42-.015-.63a9.936 9.936 0 002.46-2.548l-.047-.02z"/>
                      </svg>
                      Twitter
                    </div>
                  </label>
                  <div className="flex rounded-md">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs">
                      @
                    </span>
                    <input
                      type="text"
                      id="twitter"
                      name="twitter"
                      defaultValue={communityProfile?.socialLinks?.twitter || ''}
                      placeholder="username"
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="discord" className="block text-sm text-gray-700 mb-1">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="#5865F2" className="w-4 h-4 mr-2">
                        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
                      </svg>
                      Discord
                    </div>
                  </label>
                  <input
                    type="text"
                    id="discord"
                    name="discord"
                    defaultValue={communityProfile?.socialLinks?.discord || ''}
                    placeholder="username#0000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  />
                </div>
                
                <div>
                  <label htmlFor="telegram" className="block text-sm text-gray-700 mb-1">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0088CC" className="w-4 h-4 mr-2">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248c-.186 1.754-.962 6.012-1.358 7.975-.165.828-.546 1.104-.882 1.128-.753.06-1.323-.482-2.054-.942-.996-.63-1.393-.942-2.356-1.547-1.29-.8-.358-1.307.285-2.07.168-.2 3.096-2.83 3.152-3.067.005-.02.013-.14-.054-.2s-.21-.05-.299-.028c-.127.03-2.134 1.35-6.023 4.03-.51.35-1.085.6-1.72.566-.634-.036-1.853-.36-2.76-.652-.916-.306-1.68-.468-1.617-.992.034-.275.322-.552.864-.84 3.34-1.465 5.567-2.43 6.682-2.892 3.185-1.33 3.85-1.56 4.285-1.56.076 0 .524.315.524.896-.055.145-.055.282-.054.41z"/>
                      </svg>
                      Telegram
                    </div>
                  </label>
                  <div className="flex rounded-md">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs">
                      @
                    </span>
                    <input
                      type="text"
                      id="telegram"
                      name="telegram"
                      defaultValue={communityProfile?.socialLinks?.telegram || ''}
                      placeholder="username"
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="farcaster" className="block text-sm text-gray-700 mb-1">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="#8A63D2" className="w-4 h-4 mr-2">
                        <path d="M0 20C0 8.954 8.954 0 20 0s20 8.954 20 20-8.954 20-20 20S0 31.046 0 20Z"/>
                        <path fill="#fff" d="M20 8c6.627 0 12 5.373 12 12s-5.373 12-12 12-12-5.373-12-12S13.373 8 20 8Z"/>
                        <path d="M14 14c0-1.105.832-2 1.857-2h4.286c1.025 0 1.857.895 1.857 2s-.832 2-1.857 2h-4.286C14.832 16 14 15.105 14 14ZM14 20c0-1.105.832-2 1.857-2h4.286c1.025 0 1.857.895 1.857 2s-.832 2-1.857 2h-4.286C14.832 22 14 21.105 14 20ZM14 26c0-1.105.832-2 1.857-2h4.286c1.025 0 1.857.895 1.857 2s-.832 2-1.857 2h-4.286C14.832 28 14 27.105 14 26Z"/>
                        <path d="M24 14c0-1.105.832-2 1.857-2H28c1.025 0 2 .895 2 2s-.975 2-2 2h-2.143C24.832 16 24 15.105 24 14ZM24 20c0-1.105.832-2 1.857-2H28c1.025 0 2 .895 2 2s-.975 2-2 2h-2.143C24.832 22 24 21.105 24 20ZM24 26c0-1.105.832-2 1.857-2H28c1.025 0 2 .895 2 2s-.975 2-2 2h-2.143C24.832 28 24 27.105 24 26Z"/>
                      </svg>
                      Farcaster
                    </div>
                  </label>
                  <div className="flex rounded-md">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs">
                      @
                    </span>
                    <input
                      type="text"
                      id="farcaster"
                      name="farcaster"
                      defaultValue={communityProfile?.socialLinks?.farcaster || ''}
                      placeholder="username"
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="website" className="block text-sm text-gray-700 mb-1">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4A5568" className="w-4 h-4 mr-2">
                        <path d="M21.721 12.752a9.711 9.711 0 00-.945-5.003 12.754 12.754 0 01-4.339 2.708 18.991 18.991 0 01-.214 4.772 17.165 17.165 0 005.498-2.477zM14.634 15.55a17.324 17.324 0 00.332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 00.332 4.647 17.385 17.385 0 005.268 0zM9.772 17.119a18.963 18.963 0 004.456 0A17.182 17.182 0 0112 21.724a17.18 17.18 0 01-2.228-4.605zM7.777 15.23a18.87 18.87 0 01-.214-4.774 12.753 12.753 0 01-4.34-2.708 9.711 9.711 0 00-.944 5.004 17.165 17.165 0 005.498 2.477zM21.356 14.752a9.765 9.765 0 01-7.478 6.817 18.64 18.64 0 001.988-4.718 18.627 18.627 0 005.49-2.098zM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 001.988 4.718 9.765 9.765 0 01-7.478-6.816zM13.878 2.43a9.755 9.755 0 016.116 3.986 11.267 11.267 0 01-3.746 2.504 18.63 18.63 0 00-2.37-6.49zM12 2.276a17.152 17.152 0 012.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0112 2.276zM10.122 2.43a18.629 18.629 0 00-2.37 6.49 11.266 11.266 0 01-3.746-2.504 9.754 9.754 0 016.116-3.985z"/>
                      </svg>
                      Website
                    </div>
                  </label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    defaultValue={communityProfile?.socialLinks?.website || ''}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-between pt-5 border-t border-gray-200">
              <button
                type="submit"
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Create Profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 