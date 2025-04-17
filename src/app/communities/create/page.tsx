"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton, useActiveAccount, useSendTransaction } from "thirdweb/react";
import { client } from "../../client";
import { getContract, prepareContractCall, defineChain, readContract } from "thirdweb";
import { collection, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';

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

// Deployed MembershipFactory contract address
const LAUNCH_MEMBERSHIP_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_LAUNCH_MEMBERSHIP_FACTORY_ADDRESS || "0x322087ceC5b7278AA20205d0D93CAB5294E92e30";

// $GROW token contract address
const GROW_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_GROW_TOKEN_ADDRESS || "0x2d06C90890BfE06c0538F9bf5c76d3567341a7DA";

// Approved addresses for community creation (same as in communities page)
const APPROVED_CREATORS = [
  "0xc1C7C9C7A22885e323250e198c5f7374c0C9c5D5",
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
    nftPrice: "100", // Default price in $GROW tokens
    isLoading: false,
    error: "",
    deploymentStep: "",
    deployedContractAddress: "",
  });
  
  // Add image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // For club name, enforce formatting rules
    if (name === 'name') {
      // First replace any whitespace with hyphens
      const noWhitespace = value.replace(/\s+/g, '-');
      // Then remove any characters that aren't letters, numbers, or hyphens
      const validCharsOnly = noWhitespace.replace(/[^a-zA-Z0-9-]/g, '');
      setFormData(prev => ({ ...prev, [name]: validCharsOnly }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setFormData(prev => ({ ...prev, error: "Please select an image file" }));
        return;
      }
      
      setImageFile(file);
      
      // Create a preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      // Clear any previous error
      setFormData(prev => ({ ...prev, error: "" }));
    }
  };
  
  // Upload image to Firebase Storage
  const uploadImage = async (file: File): Promise<string> => {
    setIsUploading(true);
    
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `communities/${Date.now()}_${file.name}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw new Error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeAccount) {
      setFormData(prev => ({ ...prev, error: "Please connect your wallet first" }));
      return;
    }
    
    // Validate required fields
    if (!formData.name || !formData.description || 
        !formData.membershipLimit || !formData.nftPrice) {
      setFormData(prev => ({ ...prev, error: "Please fill in all required fields" }));
      return;
    }
    
    // Validate club name format
    const nameRegex = /^[a-zA-Z0-9-]+$/;
    if (!nameRegex.test(formData.name)) {
      setFormData(prev => ({ 
        ...prev, 
        error: "Club name must only contain letters, numbers, and hyphens (no spaces or special characters)" 
      }));
      return;
    }
    
    // Validate image (either uploaded file or URL)
    if (!imageFile && !formData.image) {
      setFormData(prev => ({ ...prev, error: "Please provide an image for your club" }));
      return;
    }
    
    try {
      // Set the NFT name to match club name
      const updatedFormData = {
        ...formData,
        nftName: formData.name, // Auto-set NFT name to match club name
        nftSymbol: formData.name.substring(0, 4).toUpperCase(), // Auto-generate symbol
        nftDescription: `Membership for ${formData.name}`, // Auto-generate description
      };
      
      setFormData(prev => ({ 
        ...prev, 
        isLoading: true, 
        error: "", 
        deploymentStep: "Initializing..." 
      }));
      
      // Upload image if provided
      if (imageFile) {
        setFormData(prev => ({ ...prev, deploymentStep: "Uploading image..." }));
        try {
          const imageUrl = await uploadImage(imageFile);
          updatedFormData.image = imageUrl;
        } catch (uploadError) {
          throw new Error("Failed to upload image. Please try again.");
        }
      } else if (!formData.image) {
        throw new Error("Please provide an image for your club");
      }
      
      // Parse form data
      const membershipLimit = parseInt(updatedFormData.membershipLimit);
      const nftPrice = parseFloat(updatedFormData.nftPrice);
      const tagsArray = updatedFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      setFormData(prev => ({ ...prev, deploymentStep: "Deploying new membership contract..." }));
      
      // Deploy a new membership contract for this community using the factory
      // The factory will deploy a new LaunchMembershipV6 contract for each community
      const deployContract = getContract({
        client,
        address: LAUNCH_MEMBERSHIP_FACTORY_ADDRESS, // The factory contract that deploys individual membership contracts
        chain: baseSepolia,
      });
      
      // Convert the price to token units with 18 decimals
      const priceInTokens = BigInt(Math.floor(nftPrice * 1e18));
      
      try {
        // Deploy a new contract with all the parameters set correctly from the start
        const deployTx = prepareContractCall({
          contract: deployContract,
          method: "function deployMembershipContract(string,string,string,uint256,uint256,string,string,address)",
          params: [
            updatedFormData.name, // clubName
            updatedFormData.description, // clubDescription
            updatedFormData.image, // clubImageURI - This image is used for both the club and NFT
            BigInt(membershipLimit), // membershipLimit
            priceInTokens, // membershipPrice (already in correct format with 18 decimals)
            updatedFormData.nftName || `${updatedFormData.name} Membership`, // nftName
            updatedFormData.nftSymbol || updatedFormData.name.substring(0, 4).toUpperCase(), // nftSymbol
            GROW_TOKEN_ADDRESS // paymentToken
          ],
          gas: 15000000n, // Increased gas limit for contract deployment to handle reentrancy sentry
        });
        
        const deployResult = await sendTransaction(deployTx);
        console.log("Deployment transaction:", deployResult);
        
        // Wait for the transaction to be mined (this is simplified, you might need event listeners)
        setFormData(prev => ({ ...prev, deploymentStep: "Waiting for contract deployment confirmation..." }));
        await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds for deployment
        
        // Get the contract address from events (this is simplified)
        // In a real implementation, you'd listen for events or use the transaction receipt
        // to get the newly deployed contract address
        const factoryContract = getContract({
          client,
          address: LAUNCH_MEMBERSHIP_FACTORY_ADDRESS,
          chain: baseSepolia,
        });
        
        // Get the most recently deployed contract by this user
        // Note: In production, you should use event logs to get this address reliably
        const newContractAddress = await readContract({
          contract: factoryContract,
          method: "function getLastDeployedContract(address) view returns (address)",
          params: [activeAccount.address]
        });
        
        if (!newContractAddress) {
          throw new Error("Failed to retrieve the deployed contract address");
        }
        
        setFormData(prev => ({ 
          ...prev, 
          deployedContractAddress: newContractAddress,
          deploymentStep: "Contract deployed successfully! Creating community..." 
        }));
        
        // Create community data for your database
        const communityData = {
          name: updatedFormData.name,
          description: updatedFormData.description,
          image: updatedFormData.image,
          tags: tagsArray,
          membershipLimit,
          nftContractAddress: newContractAddress, // Use the new unique contract address
          nftPrice,
          nftImage: updatedFormData.image, // Store the same image URL for the NFT
          paymentTokenAddress: GROW_TOKEN_ADDRESS,
          paymentTokenSymbol: "GROW",
          creatorAddress: activeAccount.address,
          createdAt: new Date().toISOString(),
        };
        
        // Save community data to Firebase
        try {
          // Add a new document to the "communities" collection
          const docRef = await addDoc(collection(db, "communities"), communityData);
          console.log("Community saved with ID:", docRef.id);
          
          // Redirect to the new community page
          router.push(`/communities/${docRef.id}`);
        } catch (firestoreError) {
          console.error("Error saving to Firestore:", firestoreError);
          setFormData(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: "Failed to save community data to Firebase. Please try again." 
          }));
        }
      } catch (contractError) {
        console.error("Contract deployment error:", contractError);
        setFormData(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: "Failed to deploy membership contract. Please try again."
        }));
        // Don't proceed to Firebase operations when contract deployment fails
        return;
      }
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
            <p className="text-zinc-500 mt-1 text-sm">Launch a community</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/communities" className="text-sm text-zinc-500 hover:text-zinc-800 transition">
              Back
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
            {/* Required fields note */}
            <div className="text-sm text-zinc-500 mb-4">
              <span className="text-red-500">*</span> Required fields
            </div>
            
            {/* Combined Club and Membership Information Section */}
            <div className="border border-zinc-100 rounded-lg p-6">
              <h2 className="text-xl font-medium mb-6">Club Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">
                    Club Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. michael-bubles-club"
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    This will be used as your NFT collection name. Only letters, numbers, and hyphens allowed (no spaces).
                  </p>
                </div>
                
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-zinc-700 mb-1">
                    Description <span className="text-red-500">*</span>
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
                    Club Image <span className="text-red-500">*</span>
                  </label>
                  
                  {/* Image preview */}
                  {imagePreview && (
                    <div className="mb-3">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-32 h-32 object-cover rounded-lg border border-zinc-200" 
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-3">
                    <label className="cursor-pointer px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm transition-colors">
                      Upload Image
                      <input
                        type="file"
                        id="imageUpload"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                    
                    <span className="text-xs text-zinc-500">or</span>
                    
                    <input
                      type="url"
                      id="image"
                      name="image"
                      value={formData.image}
                      onChange={handleChange}
                      placeholder="Paste image URL"
                      className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Upload an image or provide a URL for your club's image (required)
                  </p>
                  <p className="text-xs text-zinc-500">
                    This image will be used for both the club and membership NFT
                  </p>
                </div>
                
                <div>
                  <label htmlFor="membershipLimit" className="block text-sm font-medium text-zinc-700 mb-1">
                    Membership Limit <span className="text-red-500">*</span>
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
                
                <div>
                  <label htmlFor="nftPrice" className="block text-sm font-medium text-zinc-700 mb-1">
                    Membership Price ($GROW tokens) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="nftPrice"
                    name="nftPrice"
                    step="1"
                    min="0"
                    required
                    value={formData.nftPrice}
                    onChange={handleChange}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Members will pay with $GROW tokens instead of ETH
                  </p>
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
                  <p className="text-xs text-zinc-500 mt-1">
                    Optional: Add tags to categorize your club
                  </p>
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
            
            {/* Success message */}
            {formData.deploymentStep === "Club successfully created!" && (
              <div className="bg-green-50 text-green-600 p-4 rounded-lg text-sm mb-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Club successfully created! You can view it on the <a 
                    href={`https://sepolia-explorer.base.org/address/${LAUNCH_MEMBERSHIP_FACTORY_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    block explorer
                  </a>.</span>
                </div>
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
                {formData.isLoading ? 
                  (isUploading ? 'Uploading...' : 'Creating...') 
                  : 'Create Club'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
} 