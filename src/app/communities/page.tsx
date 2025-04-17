"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "../client";
import { getContract, readContract, defineChain } from "thirdweb";

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
  memberCount?: number; // Optional as it will be fetched separately
  userHasMembership?: boolean; // Whether current user has membership
}

// Define sort options
type SortOption = 'popular' | 'trending' | 'new' | 'price-low' | 'price-high' | 'members';

// Approved addresses for community creation (same as in communities page)
const APPROVED_CREATORS = [
  "0xc1C7C9C7A22885e323250e198c5f7374c0C9c5D5", // Example address
];

export default function Communities() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Add a refresh key for manual refresh
  const [sortOption, setSortOption] = useState<SortOption>('new'); // Default sort option changed to 'new'
  const [showSortMenu, setShowSortMenu] = useState(false); // For dropdown menu
  const activeAccount = useActiveAccount();
  
  // Function to check if user is creator of a community
  const isCreatorOf = (community: Community) => {
    return activeAccount && activeAccount.address === community.creatorAddress;
  };

  // Function to manually refresh the community data
  const refreshCommunities = () => {
    setLoading(true);
    setRefreshKey(prev => prev + 1);
  };
  
  useEffect(() => {
    async function fetchCommunities() {
      try {
        const querySnapshot = await getDocs(collection(db, "communities"));
        const communitiesList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          memberCount: 0, // Initialize with 0
          userHasMembership: false // Initialize with false
        })) as Community[];
        
        // Fetch member counts and check membership for each community
        const updatedCommunities = await Promise.all(communitiesList.map(async (community) => {
          if (community.nftContractAddress && activeAccount) {
            try {
              const contract = getContract({
                client,
                address: community.nftContractAddress,
                // Using baseSepolia chain as seen in the community detail page
                chain: baseSepolia,
              });
              
              const totalMembers = await readContract({
                contract,
                method: "function totalMembers() view returns (uint256)",
                params: []
              });
              
              // Check if current user has membership
              let userHasMembership = false;
              
              // When counting members, ensure creator is included
              // Start with the total members from contract
              let memberCount = Number(totalMembers);
              
              // Check if creator is already included in the count
              try {
                const creatorHasMembership = await readContract({
                  contract,
                  method: "function hasMembership(address) view returns (bool)",
                  params: [community.creatorAddress]
                }).catch(() => 
                  readContract({
                    contract,
                    method: "function isMember(address) view returns (bool)",
                    params: [community.creatorAddress]
                  })
                ).catch(() => 
                  readContract({
                    contract,
                    method: "function balanceOf(address) view returns (uint256)",
                    params: [community.creatorAddress]
                  }).then(balance => Number(balance) > 0)
                );
                
                // If creator doesn't have membership through normal channels, add them manually
                if (!creatorHasMembership) {
                  memberCount += 1;
                }
              } catch (error) {
                console.error(`Error checking creator membership for ${community.id}:`, error);
                // If we can't verify, add 1 to ensure creator is counted
                memberCount += 1;
              }
              
              if (activeAccount) {
                try {
                  // First try with hasMembership function
                  try {
                    const hasMembership = await readContract({
                      contract,
                      method: "function hasMembership(address) view returns (bool)",
                      params: [activeAccount.address]
                    });
                    
                    userHasMembership = Boolean(hasMembership);
                  } catch (error) {
                    console.log(`hasMembership function failed for ${community.id}, trying isMember...`);
                    
                    // If hasMembership fails, try with isMember function
                    try {
                      const isMember = await readContract({
                        contract,
                        method: "function isMember(address) view returns (bool)",
                        params: [activeAccount.address]
                      });
                      
                      userHasMembership = Boolean(isMember);
                    } catch (innerError) {
                      console.error(`Both membership checks failed for ${community.id}:`, innerError);
                      
                      // As a last resort, check balanceOf to see if user has any tokens
                      try {
                        const balance = await readContract({
                          contract,
                          method: "function balanceOf(address) view returns (uint256)",
                          params: [activeAccount.address]
                        });
                        
                        userHasMembership = Number(balance) > 0;
                      } catch (finalError) {
                        console.error(`All membership checks failed for ${community.id}:`, finalError);
                      }
                    }
                  }
                } catch (error) {
                  console.error(`Error checking membership for ${community.id}:`, error);
                }
              }
              
              return {
                ...community,
                memberCount: memberCount,
                userHasMembership
              };
            } catch (error) {
              console.error(`Error fetching data for ${community.id}:`, error);
              return community;
            }
          }
          return community;
        }));
        
        setCommunities(updatedCommunities);
      } catch (error) {
        console.error("Error fetching communities:", error);
        setError("Failed to load communities. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchCommunities();
  }, [activeAccount, refreshKey]);
  
  // Sort communities based on selected option
  const sortedCommunities = [...communities].sort((a, b) => {
    switch (sortOption) {
      case 'popular':
        // Sort by member count (descending)
        return (b.memberCount || 0) - (a.memberCount || 0);
      case 'trending':
        // For demo purposes, sort by created date (most recent trending)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'new':
        // Sort by creation date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'price-low':
        // Sort by price (lowest first)
        return a.nftPrice - b.nftPrice;
      case 'price-high':
        // Sort by price (highest first)
        return b.nftPrice - a.nftPrice;
      case 'members':
        // Sort by percentage of capacity filled
        const percentA = (a.memberCount || 0) / a.membershipLimit;
        const percentB = (b.memberCount || 0) / b.membershipLimit;
        return percentB - percentA;
      default:
        return 0;
    }
  });

  // Handle sort option selection
  const handleSortSelect = (option: SortOption) => {
    setSortOption(option);
    setShowSortMenu(false);
  };
  
  return (
    <main className="min-h-screen bg-gray-50 text-zinc-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium">Explore Clubs</h1>
            <p className="text-zinc-500 mt-1 text-sm">Discover and join communities with NFT memberships</p>
          </div>
          <div className="flex items-center gap-4">
            {activeAccount && (
              <Link href="/communities/create" className="px-4 py-2 bg-[#008CFF] text-white rounded-full hover:bg-[#0070CC] transition">
                Create Club
              </Link>
            )}
            <button 
              onClick={refreshCommunities}
              className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition"
              title="Refresh club memberships"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Collabr",
                url: "https://collabr.xyz",
              }}
            />
          </div>
        </div>
        
        {/* Filter and sort options - Reddit-like */}
        <div className="bg-white rounded-md shadow-sm mb-4 p-3 flex items-center justify-between">
          <div className="flex space-x-4">
            <button 
              className={`flex items-center text-sm font-medium ${sortOption === 'popular' ? 'text-[#008CFF] bg-blue-50' : 'text-zinc-600 hover:bg-gray-100'} rounded-full px-3 py-1.5`}
              onClick={() => handleSortSelect('popular')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Popular
            </button>
            <button 
              className={`flex items-center text-sm font-medium ${sortOption === 'trending' ? 'text-[#008CFF] bg-blue-50' : 'text-zinc-600 hover:bg-gray-100'} rounded-full px-3 py-1.5`}
              onClick={() => handleSortSelect('trending')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Trending
            </button>
            <button 
              className={`flex items-center text-sm font-medium ${sortOption === 'new' ? 'text-[#008CFF] bg-blue-50' : 'text-zinc-600 hover:bg-gray-100'} rounded-full px-3 py-1.5`}
              onClick={() => handleSortSelect('new')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              New
            </button>
          </div>
          <div className="relative">
            <button 
              className="flex items-center text-sm font-medium text-zinc-600 hover:bg-gray-100 rounded-full px-3 py-1.5"
              onClick={() => setShowSortMenu(!showSortMenu)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
              More Options
            </button>
            
            {/* Sort dropdown menu */}
            {showSortMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50">
                <div className="py-1 rounded-md bg-white shadow-xs">
                  <button
                    onClick={() => handleSortSelect('price-low')}
                    className={`block px-4 py-2 text-sm text-gray-700 w-full text-left hover:bg-gray-100 ${sortOption === 'price-low' ? 'bg-blue-50 text-blue-600' : ''}`}
                  >
                    Price: Low to High
                  </button>
                  <button
                    onClick={() => handleSortSelect('price-high')}
                    className={`block px-4 py-2 text-sm text-gray-700 w-full text-left hover:bg-gray-100 ${sortOption === 'price-high' ? 'bg-blue-50 text-blue-600' : ''}`}
                  >
                    Price: High to Low
                  </button>
                  <button
                    onClick={() => handleSortSelect('members')}
                    className={`block px-4 py-2 text-sm text-gray-700 w-full text-left hover:bg-gray-100 ${sortOption === 'members' ? 'bg-blue-50 text-blue-600' : ''}`}
                  >
                    By Member Capacity
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="bg-white rounded-md shadow-sm p-4 animate-pulse">
                <div className="flex">
                  {/* Community icon */}
                  <div className="h-12 w-12 bg-gray-200 rounded-full mr-3 flex-shrink-0"></div>
                  
                  {/* Content */}
                  <div className="flex-grow">
                    <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-1"></div>
                    <div className="h-4 bg-gray-200 rounded w-full mb-3"></div>
                    <div className="flex gap-2">
                      <div className="h-6 w-16 bg-gray-200 rounded"></div>
                      <div className="h-6 w-16 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  
                  {/* Join button and price */}
                  <div className="ml-4 flex-shrink-0 flex flex-col items-center">
                    <div className="h-8 w-20 bg-gray-200 rounded-full mb-2"></div>
                    <div className="h-5 w-16 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-md shadow-sm text-sm">
            {error}
          </div>
        ) : communities.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-md shadow-sm">
            <h2 className="text-xl font-medium mb-4">No Clubs Yet</h2>
            <p className="text-zinc-500 mb-6">Be the first to create a club!</p>
            {activeAccount && (
              <Link href="/communities/create" className="px-6 py-3 bg-[#008CFF] text-white rounded-full hover:bg-[#0070CC] transition">
                Create Club
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCommunities.map(community => (
              <div key={community.id} className="bg-white rounded-md shadow-sm hover:shadow transition">
                <div className="flex p-4">
                  {/* Community icon */}
                  <div className="h-12 w-12 rounded-full overflow-hidden mr-3 flex-shrink-0 border border-gray-200">
                    <img 
                      src={community.image} 
                      alt={community.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "https://via.placeholder.com/400x400?text=r/";
                      }}
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-grow">
                    <Link href={`/communities/${community.id}`}>
                      <h2 className="text-lg font-medium hover:text-[#008CFF] transition">
                        {community.name}
                      </h2>
                    </Link>
                    <p className="text-xs text-zinc-500 mb-1">
                      #Members: {community.memberCount !== undefined ? community.memberCount : '0'}/{community.membershipLimit}
                    </p>
                    <p className="text-sm text-zinc-700 mb-2 line-clamp-2">{community.description}</p>
                    
                    <div className="flex flex-wrap gap-1">
                      {community.tags && community.tags.map(tag => (
                        <span key={tag} className="bg-gray-100 text-zinc-600 text-xs px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="flex items-center mt-2 text-xs text-zinc-500">
                      {/* <button className="flex items-center hover:bg-gray-100 rounded-full px-2 py-1 mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Comments
                      </button> */}
                      <button className="flex items-center hover:bg-gray-100 rounded-full px-2 py-1 mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        Share
                      </button>
                      <button className="flex items-center hover:bg-gray-100 rounded-full px-2 py-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        Save
                      </button>
                    </div>
                  </div>
                  
                  {/* Join button and price */}
                  <div className="ml-4 flex-shrink-0 flex flex-col items-center">
                    <Link href={`/communities/${community.id}${isCreatorOf(community) || community.userHasMembership ? '/room' : ''}`} className={`inline-block px-4 py-1.5 text-white text-sm font-medium rounded-full hover:bg-[#0070CC] transition mb-2 ${
                      isCreatorOf(community) || community.userHasMembership ? 'bg-black' : 'bg-[#008CFF]'
                    }`}>
                      {isCreatorOf(community) || community.userHasMembership ? 'View' : 'Join'}
                    </Link>
                    <span className="text-xs font-medium text-zinc-500">{community.nftPrice} $GROW</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 