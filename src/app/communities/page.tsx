"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "../client";
import { useRouter } from "next/navigation";

// Mock data for communities
const MOCK_COMMUNITIES = [
  {
    id: "1",
    name: "DeFi Innovators",
    description: "A community focused on decentralized finance innovations and strategies.",
    members: 1243,
    image: "https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=2832&auto=format&fit=crop",
    tags: ["DeFi", "Finance", "Yield Farming"]
  },
  {
    id: "2",
    name: "NFT Creators",
    description: "Connect with artists and collectors in the NFT space.",
    members: 892,
    image: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=2874&auto=format&fit=crop",
    tags: ["NFT", "Art", "Collectibles"]
  },
  {
    id: "3",
    name: "DAO Governance",
    description: "Discuss and participate in decentralized autonomous organization governance.",
    members: 567,
    image: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2832&auto=format&fit=crop",
    tags: ["DAO", "Governance", "Voting"]
  },
  {
    id: "4",
    name: "Web3 Developers",
    description: "A hub for blockchain and Web3 developers to collaborate on projects.",
    members: 1876,
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2834&auto=format&fit=crop",
    tags: ["Development", "Coding", "Web3"]
  },
  {
    id: "5",
    name: "Crypto Traders",
    description: "Share trading strategies and market analysis with fellow traders.",
    members: 2341,
    image: "https://images.unsplash.com/photo-1621761191319-c6fb62004040?q=80&w=2787&auto=format&fit=crop",
    tags: ["Trading", "Market Analysis", "Investment"]
  }
];

// Mock user data
const MOCK_USER_COMMUNITIES = ["1", "3"]; // IDs of communities the user has joined

export default function Communities() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const activeAccount = useActiveAccount();
  const router = useRouter();
  
  // Extract all unique tags from communities
  const allTags = Array.from(
    new Set(MOCK_COMMUNITIES.flatMap(community => community.tags))
  );
  
  // Filter communities based on search term and selected tags
  const filteredCommunities = MOCK_COMMUNITIES.filter(community => {
    const matchesSearch = community.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         community.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => community.tags.includes(tag));
    
    return matchesSearch && matchesTags;
  });
  
  // Get user's joined communities
  const userCommunities = MOCK_COMMUNITIES.filter(community => 
    MOCK_USER_COMMUNITIES.includes(community.id)
  );
  
  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  // Handle joining a community
  const handleJoinCommunity = (communityId: string) => {
    // In a real app, you would call an API to join the community
    // For now, we'll just navigate to the community page
    router.push(`/communities/${communityId}`);
  };

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-2xl font-medium">Communities</h1>
            <p className="text-zinc-500 mt-1 text-sm">Find your people</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 transition">
              Home
            </Link>
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Collabr",
                url: "https://collabr.xyz",
              }}
            />
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left column - Communities list */}
          <div className="flex-1">
            {/* Search and filter */}
            <div className="mb-8">
              <input
                type="text"
                placeholder="Search communities..."
                className="w-full border-b border-zinc-200 py-2 px-1 text-sm focus:outline-none focus:border-zinc-400 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              
              {/* Tags filter */}
              <div className="flex flex-wrap gap-2 mt-4">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-xs ${
                      selectedTags.includes(tag)
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    } transition-colors`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Communities list */}
            <div className="divide-y divide-zinc-100">
              {filteredCommunities.map(community => (
                <div key={community.id} className="py-6 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-100 flex-shrink-0">
                        <img 
                          src={community.image} 
                          alt={community.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <h3 
                          className="text-lg font-medium group-hover:text-zinc-600 transition-colors cursor-pointer"
                          onClick={() => router.push(`/communities/${community.id}`)}
                        >
                          {community.name}
                        </h3>
                        <p className="text-zinc-500 text-sm mt-1">{community.members} members</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleJoinCommunity(community.id)}
                      className={`px-4 py-1 rounded-full text-sm transition-colors ${
                        MOCK_USER_COMMUNITIES.includes(community.id)
                          ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          : 'border border-zinc-200 hover:border-zinc-400 text-zinc-800'
                      }`}
                    >
                      {MOCK_USER_COMMUNITIES.includes(community.id) ? 'View' : 'Join'}
                    </button>
                  </div>
                  <p className="text-zinc-600 mt-3 text-sm">{community.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {community.tags.map(tag => (
                      <span key={tag} className="text-zinc-500 text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              
              {filteredCommunities.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  No communities found matching your criteria
                </div>
              )}
            </div>
          </div>
          
          {/* Right column - User profile */}
          <div className="w-full md:w-80 flex-shrink-0">
            <div className="sticky top-8 border border-zinc-100 rounded-lg p-6">
              {activeAccount ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium">Your Profile</h3>
                      <p className="text-xs text-zinc-500 truncate max-w-[200px]">{activeAccount.address}</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-3">Your Communities</h4>
                    {userCommunities.length > 0 ? (
                      <div className="space-y-3">
                        {userCommunities.map(community => (
                          <div key={community.id} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-100 flex-shrink-0">
                              <img 
                                src={community.image} 
                                alt={community.name} 
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-sm">{community.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500">You haven't joined any communities yet</p>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-3">Activity</h4>
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-500 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span>Active since {new Date().toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-zinc-500 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>{userCommunities.length} communities joined</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <h3 className="font-medium mb-2">Connect Wallet</h3>
                  <p className="text-sm text-zinc-500 mb-4">Connect your wallet to view your profile and join communities</p>
                  <ConnectButton
                    client={client}
                    appMetadata={{
                      name: "Collabr",
                      url: "https://collabr.xyz",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 