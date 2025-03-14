"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

// Deployed LaunchMembership contract address
const LAUNCH_MEMBERSHIP_CONTRACT_ADDRESS = "0x95019A575DC807a6153471262bec892dDdf3e61e";

// Approved addresses for community creation (same as in communities page)
const APPROVED_CREATORS = [
  "0xc1C7C9C7A22885e323250e198c5f7374c0C9c5D5", // Example address
];

export default function CreateCommunity() {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const { mutate: sendTransaction } = useSendTransaction();
  
  // Check if current user is approved to create communities
  const isApprovedCreator = activeAccount ? 
    APPROVED_CREATORS.includes(activeAccount.address) : false;
  
  // Redirect if not approved
  if (activeAccount && !isApprovedCreator) {
    router.push('/communities');
  }
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    image: "",
    tags: "",
    membershipLimit: "100",
    nftName: "",
    nftSymbol: "",
    nftDescription: "",
    nftPrice: "0.01",
    isLoading: false,
    error: "",
    deploymentStep: "",
  });
  
  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeAccount) {
      setFormData(prev => ({ ...prev, error: "Please connect your wallet first" }));
      return;
    }
    
    try {
      setFormData(prev => ({ 
        ...prev, 
        isLoading: true, 
        error: "", 
        deploymentStep: "Initializing..." 
      }));
      
      // Parse form data
      const membershipLimit = parseInt(formData.membershipLimit);
      const nftPrice = parseFloat(formData.nftPrice);
      const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      setFormData(prev => ({ ...prev, deploymentStep: "Connecting to contract..." }));
      
      // Get the deployed LaunchMembership contract
      const contract = getContract({
        client,
        address: LAUNCH_MEMBERSHIP_CONTRACT_ADDRESS,
        chain: baseSepolia, // Using Base Sepolia testnet
      });
      
      // Create a new club by calling the contract methods
      setFormData(prev => ({ ...prev, deploymentStep: "Updating club info..." }));
      
      // Update club info
      const updateInfoTx = prepareContractCall({
        contract,
        method: "function updateClubInfo(string,string,string)",
        params: [formData.name, formData.description, formData.image]
      });
      
      await sendTransaction(updateInfoTx);
      
      // Update membership price
      setFormData(prev => ({ ...prev, deploymentStep: "Updating membership price..." }));
      const priceInWei = BigInt(Math.floor(nftPrice * 1e18)); // Convert ETH to wei
      
      const updatePriceTx = prepareContractCall({
        contract,
        method: "function updateMembershipPrice(uint256)",
        params: [priceInWei]
      });
      
      await sendTransaction(updatePriceTx);
      
      // Update membership limit
      setFormData(prev => ({ ...prev, deploymentStep: "Updating membership limit..." }));
      const updateLimitTx = prepareContractCall({
        contract,
        method: "function updateMembershipLimit(uint256)",
        params: [BigInt(membershipLimit)]
      });
      
      await sendTransaction(updateLimitTx);
      
      // Create community data for your database
      const communityData = {
        name: formData.name,
        description: formData.description,
        image: formData.image,
        tags: tagsArray,
        membershipLimit,
        nftContractAddress: LAUNCH_MEMBERSHIP_CONTRACT_ADDRESS,
        nftPrice,
        creatorAddress: activeAccount.address,
        createdAt: new Date().toISOString(),
      };
      
      // Save community data to your database
      setFormData(prev => ({ ...prev, deploymentStep: "Saving community data..." }));
      
      // In a real implementation, you would use the following code:
      /*
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(communityData),
      });
      
      const data = await response.json();
      const communityId = data.id;
      */
      
      // For now, we'll simulate the database save with a timeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock community ID
      const mockCommunityId = "1";
      
      console.log("Created community with contract address:", LAUNCH_MEMBERSHIP_CONTRACT_ADDRESS);
      
      // Redirect to the new community page
      router.push(`/communities/${mockCommunityId}`);
      
    } catch (error) {
      console.error("Error creating community:", error);
      setFormData(prev => ({ 
        ...prev, 
        isLoading: false, 
        deploymentStep: "",
        error: "Failed to create community. Please try again." 
      }));
    }
  };
  
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium">Create New Club</h1>
            <p className="text-zinc-500 mt-1 text-sm">Launch your own community with NFT membership</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/communities" className="text-sm text-zinc-500 hover:text-zinc-800 transition">
              Back to Communities
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
        
        {!activeAccount ? (
          <div className="text-center py-12 border border-zinc-100 rounded-lg">
            <h2 className="text-xl font-medium mb-4">Connect Your Wallet</h2>
            <p className="text-zinc-500 mb-6">You need to connect your wallet to create a new club</p>
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Collabr",
                url: "https://collabr.xyz",
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Club Information Section */}
            <div className="border border-zinc-100 rounded-lg p-6">
              <h2 className="text-xl font-medium mb-6">Club Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">
                    Club Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. #culés"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-zinc-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe your club and its purpose"
                    rows={4}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="image" className="block text-sm font-medium text-zinc-700 mb-1">
                    Club Image URL
                  </label>
                  <input
                    type="url"
                    id="image"
                    name="image"
                    required
                    value={formData.image}
                    onChange={handleChange}
                    placeholder="https://example.com/image.jpg"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="tags" className="block text-sm font-medium text-zinc-700 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    id="tags"
                    name="tags"
                    value={formData.tags}
                    onChange={handleChange}
                    placeholder="e.g. Sports, Soccer, Football"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="membershipLimit" className="block text-sm font-medium text-zinc-700 mb-1">
                    Membership Limit
                  </label>
                  <input
                    type="number"
                    id="membershipLimit"
                    name="membershipLimit"
                    min="1"
                    max="10000"
                    required
                    value={formData.membershipLimit}
                    onChange={handleChange}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            
            {/* NFT Membership Section */}
            <div className="border border-zinc-100 rounded-lg p-6">
              <h2 className="text-xl font-medium mb-6">NFT Membership</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="nftName" className="block text-sm font-medium text-zinc-700 mb-1">
                    NFT Collection Name
                  </label>
                  <input
                    type="text"
                    id="nftName"
                    name="nftName"
                    required
                    value={formData.nftName}
                    onChange={handleChange}
                    placeholder="e.g. Culés Membership"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="nftSymbol" className="block text-sm font-medium text-zinc-700 mb-1">
                    NFT Symbol
                  </label>
                  <input
                    type="text"
                    id="nftSymbol"
                    name="nftSymbol"
                    required
                    value={formData.nftSymbol}
                    onChange={handleChange}
                    placeholder="e.g. CULE"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="nftDescription" className="block text-sm font-medium text-zinc-700 mb-1">
                    NFT Description
                  </label>
                  <textarea
                    id="nftDescription"
                    name="nftDescription"
                    required
                    value={formData.nftDescription}
                    onChange={handleChange}
                    placeholder="Describe the membership benefits"
                    rows={3}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="nftPrice" className="block text-sm font-medium text-zinc-700 mb-1">
                    Membership Price (ETH)
                  </label>
                  <input
                    type="number"
                    id="nftPrice"
                    name="nftPrice"
                    step="0.001"
                    min="0"
                    required
                    value={formData.nftPrice}
                    onChange={handleChange}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            
            {/* Deployment status */}
            {formData.isLoading && (
              <div className="bg-blue-50 text-blue-600 p-4 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{formData.deploymentStep}</span>
                </div>
              </div>
            )}
            
            {/* Error message */}
            {formData.error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
                {formData.error}
              </div>
            )}
            
            {/* Submit button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={formData.isLoading || !isApprovedCreator}
                className={`px-6 py-3 rounded-lg text-white transition-colors ${
                  formData.isLoading || !isApprovedCreator
                    ? 'bg-zinc-300 cursor-not-allowed'
                    : 'bg-[#008CFF] hover:bg-[#0070CC]'
                }`}
              >
                {formData.isLoading ? 'Creating...' : 'Create Club'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
} 