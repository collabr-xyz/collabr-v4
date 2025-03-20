"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "../../../../client";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
  const [isEditMode, setIsEditMode] = useState(false);

  // Fetch community and user profile data
  useEffect(() => {
    if (!communityId || !activeAccount) return;

    async function fetchData() {
      setIsLoading(true);
      try {
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
          setIsEditMode(profileData.isProfileComplete);
          
          // If user already has a complete profile, redirect to community room
          if (profileData.isProfileComplete) {
            // Stay on page in edit mode instead of redirecting
            // router.push(`/communities/${communityId}/room`);
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
      
      // Redirect to community room
      router.push(`/communities/${communityId}/room`);
    } catch (error) {
      console.error("Error saving profile:", error);
      setErrorMessage("Failed to save profile. Please try again.");
    }
  };

  // Skip profile setup
  const handleSkipProfileSetup = () => {
    // Create a minimal profile record to mark that they've joined
    if (activeAccount && communityId) {
      const profileRef = doc(db, "communities", communityId, "profiles", activeAccount.address);
      setDoc(profileRef, {
        userId: activeAccount.address,
        communityId: communityId,
        displayName: activeAccount.address.slice(0, 6) + '...' + activeAccount.address.slice(-4),
        joinedAt: serverTimestamp(),
        isProfileComplete: false
      } as { [x: string]: any })
        .then(() => {
          router.push(`/communities/${communityId}/room`);
        })
        .catch(error => {
          console.error("Error creating minimal profile:", error);
          setErrorMessage("Failed to skip profile setup. Please try again.");
        });
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
              {isEditMode ? 'Edit Your Profile' : 'Create Your Community Profile'}
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {community?.name ? `for ${community.name}` : ''}
            </p>
          </div>
          <Link 
            href={`/communities/${communityId}/room`} 
            className="text-sm text-zinc-500 hover:text-zinc-800 transition"
          >
            Back to Community
          </Link>
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {errorMessage}
          </div>
        )}

        <div className="bg-white border border-zinc-200 rounded-lg p-6 mb-6">
          <div className="text-sm text-gray-600 mb-6">
            {isEditMode 
              ? "Update your profile information for this community."
              : community?.name 
                ? <p>Welcome to <span className="font-medium">{community.name}</span>! Please set up your profile for this community. This profile will only be visible within this community.</p>
                : "Set up your profile for this community. This profile will only be visible within this community."
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
          }} className="space-y-6">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="avatarDefault" className="ml-2 block text-sm text-gray-700">
                    Use default avatar
                  </label>
                  <div className="ml-2 w-10 h-10 rounded-full overflow-hidden">
                    <Image
                      src={`https://api.dicebear.com/7.x/identicon/svg?seed=${activeAccount.address}`}
                      alt="Default avatar"
                      width={40}
                      height={40}
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
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="ml-2 text-sm">
                    <label htmlFor="avatarCustom" className="font-medium text-gray-700">
                      Upload custom avatar
                    </label>
                    {customAvatarFile ? (
                      <div className="mt-2 flex items-center">
                        <div className="w-12 h-12 rounded-full overflow-hidden">
                          <Image
                            src={URL.createObjectURL(customAvatarFile)}
                            alt="Custom avatar preview"
                            width={48}
                            height={48}
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
                    ) : communityProfile?.avatar && !communityProfile.avatar.includes('dicebear') ? (
                      <div className="mt-2 flex items-center">
                        <div className="w-12 h-12 rounded-full overflow-hidden">
                          <Image
                            src={communityProfile.avatar}
                            alt="Current avatar"
                            width={48}
                            height={48}
                            className="object-cover"
                          />
                        </div>
                        <label 
                          htmlFor="avatarUpload"
                          className="ml-2 cursor-pointer text-xs text-blue-500 hover:text-blue-700"
                        >
                          Change
                        </label>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <label 
                          htmlFor="avatarUpload"
                          className="cursor-pointer inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Choose file
                        </label>
                      </div>
                    )}
                    <input
                      type="file"
                      id="avatarUpload"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Social Links */}
            <div className="border-t border-gray-200 pt-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Social Links (Optional)</h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="twitter" className="block text-sm text-gray-700 mb-1">
                    Twitter
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
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="telegram" className="block text-sm text-gray-700 mb-1">
                    Telegram
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
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="website" className="block text-sm text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    defaultValue={communityProfile?.socialLinks?.website || ''}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-between pt-5 border-t border-gray-200">
              {!isEditMode && (
                <button
                  type="button"
                  onClick={handleSkipProfileSetup}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  Skip for now
                </button>
              )}
              <button
                type="submit"
                className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {isEditMode ? 'Update Profile' : 'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 