"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ConnectButton, useActiveAccount, useSendTransaction } from "thirdweb/react";
import { client } from "../../client";
import { getContract, prepareContractCall, defineChain } from "thirdweb";

// Define Base Sepolia testnet
const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
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
}

export default function CommunityDetail() {
  const params = useParams();
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  const { mutate: sendTransaction } = useSendTransaction();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchCommunity() {
      try {
        const docRef = doc(db, "communities", communityId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setCommunity({
            id: docSnap.id,
            ...docSnap.data()
          } as Community);
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
  
  const handlePurchaseMembership = async () => {
    if (!activeAccount || !community) return;
    
    try {
      setPurchaseStatus('loading');
      setPurchaseError(null);
      
      // Get the contract
      const contract = getContract({
        client,
        address: community.nftContractAddress,
        chain: baseSepolia,
      });
      
      // Prepare the purchase transaction
      const purchaseTx = prepareContractCall({
        contract,
        method: "function purchaseMembership()",
        params: [],
        value: BigInt(Math.floor(community.nftPrice * 1e18)), // Convert ETH to wei
      });
      
      // Send the transaction
      await sendTransaction(purchaseTx);
      
      setPurchaseStatus('success');
    } catch (error) {
      console.error("Error purchasing membership:", error);
      setPurchaseStatus('error');
      setPurchaseError("Failed to purchase membership. Please try again.");
    }
  };
  
  if (loading) {
    return (
      <main className="min-h-screen bg-white text-zinc-900">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#008CFF]"></div>
          </div>
        </div>
      </main>
    );
  }
  
  if (error || !community) {
    return (
      <main className="min-h-screen bg-white text-zinc-900">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
            {error || "Community not found"}
          </div>
          <div className="mt-4">
            <Link href="/communities" className="text-[#008CFF] hover:underline">
              ← Back to Communities
            </Link>
          </div>
        </div>
      </main>
    );
  }
  
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/communities" className="text-zinc-500 hover:text-zinc-800 transition mb-2 inline-block">
              ← Back to Communities
            </Link>
            <h1 className="text-3xl font-medium">{community.name}</h1>
          </div>
          <ConnectButton
            client={client}
            appMetadata={{
              name: "Collabr",
              url: "https://collabr.xyz",
            }}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left column - Community image */}
          <div className="md:col-span-1">
            <div className="rounded-lg overflow-hidden border border-zinc-100">
              <img 
                src={community.image} 
                alt={community.name} 
                className="w-full h-auto"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "https://via.placeholder.com/400x400?text=No+Image";
                }}
              />
            </div>
            
            <div className="mt-4 border border-zinc-100 rounded-lg p-4">
              <h3 className="font-medium mb-2">Community Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Membership Price:</span>
                  <span className="font-medium">{community.nftPrice} ETH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Membership Limit:</span>
                  <span>{community.membershipLimit} members</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Contract Address:</span>
                  <a 
                    href={`https://sepolia-explorer.base.org/address/${community.nftContractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#008CFF] hover:underline truncate max-w-[150px]"
                  >
                    {community.nftContractAddress.substring(0, 6)}...{community.nftContractAddress.substring(38)}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Created:</span>
                  <span>{new Date(community.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right column - Community details */}
          <div className="md:col-span-2">
            <div className="border border-zinc-100 rounded-lg p-6">
              <h2 className="text-xl font-medium mb-4">About</h2>
              <p className="text-zinc-700 whitespace-pre-line">{community.description}</p>
              
              <div className="mt-6">
                <h3 className="font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {community.tags && community.tags.map(tag => (
                    <span key={tag} className="bg-zinc-100 text-zinc-600 px-3 py-1 rounded-full text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="font-medium mb-4">Join this Community</h3>
                {!activeAccount ? (
                  <div className="bg-zinc-50 p-4 rounded-lg text-center">
                    <p className="text-zinc-600 mb-4">Connect your wallet to purchase a membership</p>
                    <ConnectButton
                      client={client}
                      appMetadata={{
                        name: "Collabr",
                        url: "https://collabr.xyz",
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={handlePurchaseMembership}
                      disabled={purchaseStatus === 'loading'}
                      className={`w-full py-3 rounded-lg text-white transition-colors ${
                        purchaseStatus === 'loading'
                          ? 'bg-zinc-300 cursor-not-allowed'
                          : 'bg-[#008CFF] hover:bg-[#0070CC]'
                      }`}
                    >
                      {purchaseStatus === 'loading' 
                        ? 'Processing...' 
                        : `Purchase Membership for ${community.nftPrice} ETH`}
                    </button>
                    
                    {purchaseStatus === 'success' && (
                      <div className="mt-4 bg-green-50 text-green-600 p-4 rounded-lg text-sm">
                        Membership purchased successfully! You are now a member of this community.
                      </div>
                    )}
                    
                    {purchaseStatus === 'error' && purchaseError && (
                      <div className="mt-4 bg-red-50 text-red-600 p-4 rounded-lg text-sm">
                        {purchaseError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 