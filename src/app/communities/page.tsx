"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConnectButton } from "thirdweb/react";
import { client } from "../client";

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

export default function Communities() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchCommunities() {
      try {
        const querySnapshot = await getDocs(collection(db, "communities"));
        const communitiesList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Community[];
        
        setCommunities(communitiesList);
      } catch (error) {
        console.error("Error fetching communities:", error);
        setError("Failed to load communities. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchCommunities();
  }, []);
  
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium">Explore Clubs</h1>
            <p className="text-zinc-500 mt-1 text-sm">Discover and join communities with NFT memberships</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/communities/create" className="px-4 py-2 bg-[#008CFF] text-white rounded-lg hover:bg-[#0070CC] transition">
              Create Club
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
        
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#008CFF]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
            {error}
          </div>
        ) : communities.length === 0 ? (
          <div className="text-center py-20 border border-zinc-100 rounded-lg">
            <h2 className="text-xl font-medium mb-4">No Clubs Yet</h2>
            <p className="text-zinc-500 mb-6">Be the first to create a club!</p>
            <Link href="/communities/create" className="px-6 py-3 bg-[#008CFF] text-white rounded-lg hover:bg-[#0070CC] transition">
              Create Club
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communities.map(community => (
              <Link href={`/communities/${community.id}`} key={community.id}>
                <div className="border border-zinc-100 rounded-lg overflow-hidden hover:shadow-md transition cursor-pointer">
                  <div className="h-48 overflow-hidden">
                    <img 
                      src={community.image} 
                      alt={community.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "https://via.placeholder.com/400x200?text=No+Image";
                      }}
                    />
                  </div>
                  <div className="p-4">
                    <h2 className="text-xl font-medium">{community.name}</h2>
                    <p className="text-zinc-500 mt-1 line-clamp-2">{community.description}</p>
                    
                    <div className="mt-3 flex flex-wrap gap-1">
                      {community.tags && community.tags.map(tag => (
                        <span key={tag} className="bg-zinc-100 text-zinc-600 text-xs px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-sm text-zinc-500">
                        <span>Limit: {community.membershipLimit} members</span>
                      </div>
                      <div className="text-sm font-medium">
                        {community.nftPrice} ETH
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 