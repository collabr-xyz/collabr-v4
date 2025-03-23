"use client";

/**
 * Community Detail Page
 * 
 * This page interacts with individual community membership contracts that are deployed
 * through the MembershipFactory contract.
 * 
 * Architecture:
 * - Each community has its own unique LaunchMembershipV4 contract deployed via the factory
 * - Communities sharing the same contract caused a limitation where users could only join one community per contract
 * - With the factory pattern, each community has a standalone contract, allowing users to join multiple communities
 * - If you see "You are already a member" errors, make sure the community is using a unique contract address
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ConnectButton, useActiveAccount, useSendTransaction } from "thirdweb/react";
import { client } from "../../client";
import { getContract, prepareContractCall, defineChain, readContract } from "thirdweb";

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
  paymentTokenAddress?: string; // Optional for backward compatibility
  paymentTokenSymbol?: string; // Optional for backward compatibility
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
  const [isCreator, setIsCreator] = useState(false);
  const [showPriceUpdateForm, setShowPriceUpdateForm] = useState(false);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [priceUpdateError, setPriceUpdateError] = useState<string | null>(null);
  const [priceUpdateSuccess, setPriceUpdateSuccess] = useState(false);
  const [sharedContractWarning, setSharedContractWarning] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [membershipTokenId, setMembershipTokenId] = useState<string | null>(null);
  const [isUserMember, setIsUserMember] = useState(false);
  
  // Function to check if multiple communities share the same contract address
  async function checkForSharedContracts(contractAddress: string, currentCommunityId: string) {
    try {
      if (!contractAddress) return;
      
      // Query communities by contract address
      const communitiesQuery = collection(db, "communities");
      const q = query(communitiesQuery, where("nftContractAddress", "==", contractAddress));
      const querySnapshot = await getDocs(q);
      
      const matchingCommunities = querySnapshot.docs
        .filter(doc => doc.id !== currentCommunityId) // Exclude current community
        .map(doc => ({
          id: doc.id,
          name: doc.data().name,
        }));
      
      if (matchingCommunities.length > 0) {
        console.warn("This contract is shared with other communities:", matchingCommunities);
        setSharedContractWarning(
          `Note: This contract address is shared with ${matchingCommunities.length} other ` +
          `communit${matchingCommunities.length > 1 ? 'ies' : 'y'}. You can only join one community per contract.`
        );
        return matchingCommunities;
      }
      
      return [];
    } catch (error) {
      console.error("Error checking for shared contracts:", error);
      return [];
    }
  }
  
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
          
          // Check if this community shares its contract address with others
          if (communityData.nftContractAddress) {
            await checkForSharedContracts(communityData.nftContractAddress, communityId);
            
            // Fetch the current member count from the contract
            try {
              const contract = getContract({
                client,
                address: communityData.nftContractAddress,
                chain: baseSepolia,
              });
              
              const totalMembers = await readContract({
                contract,
                method: "function totalMembers() view returns (uint256)",
                params: []
              });
              
              setMemberCount(Number(totalMembers));
              
              // Check if the active account is a member
              if (activeAccount) {
                try {
                  const isMember = await readContract({
                    contract,
                    method: "function isMember(address) view returns (bool)",
                    params: [activeAccount.address]
                  });
                  setIsUserMember(Boolean(isMember));
                  
                  if (Boolean(isMember)) {
                    // Get the tokenId of the user's membership NFT
                    try {
                      const ownerTokens = await readContract({
                        contract,
                        method: "function tokensOfOwner(address) view returns (uint256[])",
                        params: [activeAccount.address]
                      });
                      
                      if (ownerTokens && ownerTokens.length > 0) {
                        // Get the most recent token
                        const tokenId = ownerTokens[ownerTokens.length - 1].toString();
                        setMembershipTokenId(tokenId);
                      }
                    } catch (tokenIdError) {
                      console.error("Error retrieving NFT token ID:", tokenIdError);
                    }
                  }
                } catch (membershipCheckError) {
                  console.error("Error checking membership status:", membershipCheckError);
                  setIsUserMember(false);
                }
              }
            } catch (error) {
              console.error("Error fetching member count:", error);
            }
          }
          
          // Check if the active account is the creator
          if (activeAccount && communityData.creatorAddress === activeAccount.address) {
            setIsCreator(true);
          }
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
  }, [communityId, activeAccount]);
  
  const handlePurchaseMembership = async () => {
    if (!activeAccount || !community) return;
    
    try {
      setPurchaseStatus('loading');
      setPurchaseError(null);
      
      // Get the membership contract
      const contract = getContract({
        client,
        address: community.nftContractAddress,
        chain: baseSepolia,
      });
      
      // Check if the contract exists and is a valid membership contract
      try {
        console.log("Verifying contract at address:", community.nftContractAddress);
        
        // Call a few view methods to verify the contract is responsive
        const clubName = await readContract({
          contract,
          method: "function clubName() view returns (string)",
          params: []
        });
        
        const membershipLimit = await readContract({
          contract,
          method: "function membershipLimit() view returns (uint256)",
          params: []
        });
        
        const totalMembers = await readContract({
          contract,
          method: "function totalMembers() view returns (uint256)",
          params: []
        });
        
        console.log("Contract verification successful:");
        console.log("- Club Name:", clubName);
        console.log("- Membership Limit:", membershipLimit.toString());
        console.log("- Total Members:", totalMembers.toString());
      } catch (contractVerificationError) {
        console.error("CONTRACT VERIFICATION FAILED:", contractVerificationError);
        setPurchaseStatus('error');
        setPurchaseError(`Failed to verify the membership contract at ${community.nftContractAddress}. This might not be a valid membership contract.`);
        return;
      }
      
      // Get the GROW token address from environment variables
      const growTokenAddress = process.env.NEXT_PUBLIC_GROW_TOKEN_ADDRESS || "0x2d06C90890BfE06c0538F9bf5c76d3567341a7DA";
      console.log("Using GROW token address:", growTokenAddress);
      
      // Get the GROW token contract
      const tokenContract = getContract({
        client,
        address: growTokenAddress,
        chain: baseSepolia,
      });

      // Check user's token balance first
      let userBalance;
      try {
        userBalance = await readContract({
          contract: tokenContract,
          method: "function balanceOf(address) view returns (uint256)",
          params: [activeAccount.address]
        });
        console.log("User GROW token balance:", userBalance.toString());
      } catch (error) {
        console.error("Failed to check token balance:", error);
        throw new Error("Could not verify your token balance. Please try again.");
      }
      
      // Verify the token contract is working correctly
      try {
        // Check basic ERC20 functions to ensure the contract is valid
        const tokenSymbol = await readContract({
          contract: tokenContract,
          method: "function symbol() view returns (string)",
          params: []
        });
        
        const tokenDecimals = await readContract({
          contract: tokenContract,
          method: "function decimals() view returns (uint8)",
          params: []
        });
        
        console.log(`Token verified: ${tokenSymbol} with ${tokenDecimals} decimals`);
        
        // Additional verification...
      } catch (tokenVerificationError) {
        console.error("Token contract verification failed:", tokenVerificationError);
        throw new Error("The token contract doesn't appear to be a valid ERC20 token. Please contact support.");
      }
      
      // Convert the community.nftPrice to token units with 18 decimals
      const tokenAmount = BigInt(Math.floor(community.nftPrice * 1e18));
      console.log("Required token amount:", tokenAmount.toString());
      
      // Verify user has enough tokens
      if (userBalance < tokenAmount) {
        setPurchaseStatus('error');
        setPurchaseError(`Insufficient GROW tokens. You need ${community.nftPrice} tokens but have ${Number(userBalance) / 1e18}.`);
        return;
      }
      
      // Check allowance before approve
      let currentAllowance;
      try {
        currentAllowance = await readContract({
          contract: tokenContract,
          method: "function allowance(address,address) view returns (uint256)",
          params: [activeAccount.address, community.nftContractAddress]
        });
        console.log("Current allowance:", currentAllowance.toString());
      } catch (error) {
        console.error("Failed to check allowance:", error);
        throw new Error("Could not verify your current token allowance. Please try again.");
      }
      
      // Only approve if necessary
      if (currentAllowance < tokenAmount) {
        console.log("Approving tokens...");
        try {
          // Show loading message to user while they confirm
          setPurchaseError("Please approve GROW tokens to continue...");
          
          // Create a simple approval transaction with minimal parameters
          const simpleApproveTx = prepareContractCall({
            contract: tokenContract,
            method: "function approve(address,uint256)",
            params: [community.nftContractAddress, tokenAmount],
          });
          
          console.log("Approval target:", community.nftContractAddress);
          console.log("Approval amount:", tokenAmount.toString());
          
          // Send the transaction - this should trigger the wallet popup
          console.log("Sending approval transaction...");
          
          try {
            await sendTransaction(simpleApproveTx);
            console.log("Approval request sent to wallet");
          } catch (txError) {
            console.error("Transaction submission error:", txError);
            setPurchaseStatus('error');
            setPurchaseError("Could not submit the approval transaction. Please try again.");
            return;
          }
          
          // Show user that we're waiting for confirmation
          setPurchaseError("Waiting for transaction confirmation...");
          
          // Wait for transaction to process
          console.log("Waiting for approval confirmation...");
          await new Promise(resolve => setTimeout(resolve, 20000)); // 20 seconds to be safe
          
          // Check if approval succeeded
          const newAllowance = await readContract({
            contract: tokenContract,
            method: "function allowance(address,address) view returns (uint256)",
            params: [activeAccount.address, community.nftContractAddress]
          });
          console.log("New allowance after approval:", newAllowance.toString());
          
          if (newAllowance < tokenAmount) {
            // Try one more time
            console.log("Approval not yet reflected. Checking again in 10 seconds...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const finalAllowance = await readContract({
              contract: tokenContract,
              method: "function allowance(address,address) view returns (uint256)",
              params: [activeAccount.address, community.nftContractAddress]
            });
            
            console.log("Final allowance check:", finalAllowance.toString());
            
            if (finalAllowance < tokenAmount) {
              throw new Error("Approval not confirmed after waiting. Please try again or check your transaction in the wallet.");
            }
          }
          
          // Clear error message on success
          setPurchaseError(null);
          console.log("Token approval confirmed!");
        } catch (error) {
          console.error("Failed during approval process:", error);
          setPurchaseStatus('error');
          setPurchaseError("Could not approve token spending. Please try again later.");
          return; // Exit the function completely
        }
      } else {
        console.log("Sufficient allowance already exists. Skipping approval.");
      }
      
      // Add an additional delay to ensure the approval transaction is fully confirmed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the contract's membership price matches what we expect
      try {
        const contractMembershipPrice = await readContract({
          contract,
          method: "function membershipPrice() view returns (uint256)",
          params: []
        });
        
        console.log("Contract's membership price:", contractMembershipPrice.toString());
        const expectedPrice = BigInt(Math.floor(community.nftPrice * 1e18));
        console.log("Expected membership price:", expectedPrice.toString());
        
        if (contractMembershipPrice !== expectedPrice) {
          console.warn("Price mismatch between UI and contract!");
          console.log("UI price:", community.nftPrice, "Contract price:", Number(contractMembershipPrice) / 1e18);
          
          // If user is the creator/admin and there's a price mismatch, suggest updating the price
          if (isCreator) {
            setPurchaseStatus('error');
            setPurchaseError(`Price mismatch detected: The UI shows ${community.nftPrice} tokens but the contract is set to ${Number(contractMembershipPrice) / 1e18} tokens. Please update the contract price before members can join.`);
            setShowPriceUpdateForm(true);
            return; // Stop the purchase process
          } else {
            // For non-creators, just show an error message
            setPurchaseStatus('error');
            setPurchaseError(`Price mismatch detected: The UI shows ${community.nftPrice} tokens but the actual price is ${Number(contractMembershipPrice) / 1e18} tokens. Please contact the community creator.`);
            return; // Stop the purchase process
          }
        }
      } catch (priceCheckError) {
        console.error("Failed to verify membership price:", priceCheckError);
      }
      
      console.log("Purchasing membership...");
      console.log("Contract address:", community.nftContractAddress);
      
      // Log any state of the contract that might impact purchasing
      try {
        const isMemberAlready = await readContract({
          contract,
          method: "function isMember(address) view returns (bool)",
          params: [activeAccount.address]
        });
        console.log("User is already a member:", isMemberAlready);
        
        if (isMemberAlready) {
          // Enhanced error message explaining the architectural limitation
          setPurchaseStatus('error');
          setPurchaseError(
            "You already have a membership NFT from this contract. " +
            "Due to the current contract architecture, you can only hold one membership per contract. " +
            "We're working on upgrading to a factory contract model where each community will have its own contract address. " +
            "Please contact support for assistance or try joining a community with a different contract address."
          );
          
          // Log detailed diagnostic information to help troubleshoot
          console.log("Membership conflict detected:");
          console.log("- Contract address:", community.nftContractAddress);
          console.log("- Community ID:", communityId);
          console.log("- Community name:", community.name);
          
          return;
        }
        
        const totalMembers = await readContract({
          contract,
          method: "function totalMembers() view returns (uint256)",
          params: []
        });
        
        const membershipLimit = await readContract({
          contract,
          method: "function membershipLimit() view returns (uint256)",
          params: []
        });
        
        console.log(`Current members: ${totalMembers}/${membershipLimit}`);
        
        if (totalMembers >= membershipLimit) {
          setPurchaseStatus('error');
          setPurchaseError("This community has reached its membership limit.");
          return;
        }
      } catch (preCheckError) {
        console.error("Error checking membership status:", preCheckError);
        // Continue anyway as this is just a pre-check
      }
      
      // Now prepare the purchase transaction
      try {
        console.log("Preparing purchase transaction...");
        const purchaseTx = prepareContractCall({
          contract,
          method: "function purchaseMembership() returns (uint256)",
          params: [],
        });
        
        // Send the purchase transaction
        console.log("Submitting purchase transaction...");
        console.log("Transaction details:", {
          to: community.nftContractAddress,
          method: "purchaseMembership",
        });
        
        // Show message to user
        setPurchaseError("Please confirm the purchase in your wallet...");
        
        try {
          await sendTransaction(purchaseTx);
          console.log("Purchase transaction sent to wallet");
        } catch (txError) {
          console.error("Purchase transaction submission error:", txError);
          setPurchaseStatus('error');
          setPurchaseError("Could not submit the purchase transaction. Please try again.");
          return;
        }
        
        // Show waiting message
        setPurchaseError("Purchase submitted! Waiting for confirmation...");
        
        // Wait for transaction to be processed
        console.log("Waiting for transaction confirmation...");
        await new Promise(resolve => setTimeout(resolve, 20000)); // 20 seconds wait
        
        // Check if the NFT was minted to the user
        console.log("Checking NFT balance...");
        const balanceOfNFT = await readContract({
          contract,
          method: "function balanceOf(address) view returns (uint256)",
          params: [activeAccount.address]
        });
        console.log("User NFT balance after purchase:", balanceOfNFT.toString());
        
        if (balanceOfNFT < 1n) {
          // Check again after a delay
          console.log("NFT not yet detected. Checking again in 10 seconds...");
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          const finalNFTBalance = await readContract({
            contract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [activeAccount.address]
          });
          
          console.log("Final NFT balance check:", finalNFTBalance.toString());
          
          if (finalNFTBalance < 1n) {
            throw new Error("Membership purchase may have failed. Please check your wallet for transaction status.");
          }
        }
        
        // Success!
        setPurchaseError(null);
        setPurchaseStatus('success');
        setIsUserMember(true);
        
        // Get the token ID of the NFT the user received
        try {
          // Get the tokenId of the user's membership NFT
          const ownerTokens = await readContract({
            contract,
            method: "function tokensOfOwner(address) view returns (uint256[])",
            params: [activeAccount.address]
          });
          
          if (ownerTokens && ownerTokens.length > 0) {
            // Get the most recent token (likely the one just minted)
            const tokenId = ownerTokens[ownerTokens.length - 1].toString();
            setMembershipTokenId(tokenId);
            console.log("User received NFT with token ID:", tokenId);
          } else {
            console.log("Could not retrieve user's NFT token ID");
          }
        } catch (tokenIdError) {
          console.error("Error retrieving NFT token ID:", tokenIdError);
          // This is non-critical, so we continue even if it fails
        }
        
        // Add member to Firestore database for chat functionality
        try {
          await addDoc(collection(db, "members"), {
            communityId,
            walletAddress: activeAccount.address,
            displayName: activeAccount.address.substring(0, 6) + '...',
            joinedAt: new Date().toISOString()
          });
          console.log("Member added to Firestore for chat functionality");
        } catch (memberError) {
          console.error("Error adding member to Firestore:", memberError);
          // We don't want to revert the successful purchase if this fails
        }
        
        // Refresh the member count after successful purchase
        try {
          const totalMembers = await readContract({
            contract,
            method: "function totalMembers() view returns (uint256)",
            params: []
          });
          
          setMemberCount(Number(totalMembers));
        } catch (error) {
          console.error("Error updating member count:", error);
        }
      } catch (error) {
        console.error("Error during purchase transaction:", error);
        
        // Check if the error is related to token transfer
        const errorString = String(error);
        
        try {
          // Check if tokens are actually transferred by looking at contract's token balance
          const growTokenAddress = process.env.NEXT_PUBLIC_GROW_TOKEN_ADDRESS || "0x2d06C90890BfE06c0538F9bf5c76d3567341a7DA";
          const tokenContract = getContract({
            client,
            address: growTokenAddress,
            chain: baseSepolia,
          });
          
          // Check contract's token balance
          const contractTokenBalance = await readContract({
            contract: tokenContract,
            method: "function balanceOf(address) view returns (uint256)",
            params: [community.nftContractAddress]
          });
          
          console.log("Contract's GROW token balance:", contractTokenBalance.toString());
          
          // Verify the payment token address in the contract
          const contractPaymentToken = await readContract({
            contract,
            method: "function paymentToken() view returns (address)",
            params: []
          });
          
          console.log("Contract's payment token address:", contractPaymentToken);
          console.log("Expected payment token address:", growTokenAddress);
          
          if (contractPaymentToken.toLowerCase() !== growTokenAddress.toLowerCase()) {
            setPurchaseError(`Contract is using a different payment token than expected. Check with community admin.`);
            setPurchaseStatus('error');
            return;
          }
          
          // Re-check user's current allowance
          const currentAllowance = await readContract({
            contract: tokenContract,
            method: "function allowance(address,address) view returns (uint256)",
            params: [activeAccount.address, community.nftContractAddress]
          });
          
          console.log("Current allowance after attempted purchase:", currentAllowance.toString());
          
          if (currentAllowance.toString() === "0") {
            setPurchaseError("The transaction may have attempted to use your tokens but failed. Please try again.");
            setPurchaseStatus('error');
            return;
          }
        } catch (secondaryError) {
          console.error("Error during diagnostic checks:", secondaryError);
        }
        
        if (errorString.includes("Token transfer failed")) {
          setPurchaseError("Failed to transfer GROW tokens. Please check your balance and try again.");
        } else if (errorString.includes("Membership limit")) {
          setPurchaseError("This community has reached its membership limit.");
        } else {
          setPurchaseError("Failed to purchase membership. Error: " + (errorString.length > 100 ? errorString.slice(0, 100) + "..." : errorString));
        }
        setPurchaseStatus('error');
      }
    } catch (error) {
      console.error("Error in purchase process:", error);
      setPurchaseStatus('error');
      setPurchaseError(error instanceof Error ? error.message : "Failed to purchase membership. Please try again later.");
    }
  };
  
  // Add function to update membership price (for admins only)
  const handleUpdateMembershipPrice = async () => {
    if (!activeAccount || !community || !isCreator) return;
    
    try {
      setUpdatingPrice(true);
      setPriceUpdateError(null);
      setPriceUpdateSuccess(false);
      
      // Get the membership contract
      const contract = getContract({
        client,
        address: community.nftContractAddress,
        chain: baseSepolia,
      });
      
      // Convert the price to token units with 18 decimals
      const tokenAmount = BigInt(Math.floor(community.nftPrice * 1e18));
      
      console.log("Updating membership price to:", tokenAmount.toString());
      
      // Prepare the update price transaction
      const updatePriceTx = prepareContractCall({
        contract,
        method: "function updateMembershipPrice(uint256)",
        params: [tokenAmount],
        gas: 300000n, // Explicit gas limit
      });
      
      // Send the update price transaction
      const updateResult = await sendTransaction(updatePriceTx);
      console.log("Price update transaction submitted:", updateResult);
      
      if (updateResult === undefined || updateResult === null) {
        throw new Error("Price update transaction submission failed");
      }
      
      // Wait for the transaction to be processed
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verify the price was updated
      const newPrice = await readContract({
        contract,
        method: "function membershipPrice() view returns (uint256)",
        params: []
      });
      
      console.log("New contract price:", newPrice.toString());
      
      if (newPrice.toString() !== tokenAmount.toString()) {
        throw new Error("Price was not updated successfully");
      }
      
      setPriceUpdateSuccess(true);
      setShowPriceUpdateForm(false);
    } catch (error) {
      console.error("Error updating membership price:", error);
      setPriceUpdateError(error instanceof Error ? error.message : "Failed to update price");
    } finally {
      setUpdatingPrice(false);
    }
  };
  
  if (loading) {
    return (
      <main className="min-h-screen bg-white text-zinc-900">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header skeleton */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <div className="w-24 h-4 bg-zinc-200 rounded mb-2 animate-pulse"></div>
              <div className="w-64 h-8 bg-zinc-200 rounded animate-pulse"></div>
            </div>
            <div className="w-32 h-10 bg-zinc-200 rounded animate-pulse"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left column skeleton */}
            <div className="md:col-span-1">
              <div className="rounded-lg overflow-hidden border border-zinc-100">
                <div className="w-full h-64 bg-zinc-200 animate-pulse"></div>
              </div>
              
              <div className="mt-4 border border-zinc-100 rounded-lg p-4">
                <div className="w-40 h-6 bg-zinc-200 rounded animate-pulse mb-4"></div>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="flex justify-between">
                      <div className="w-24 h-4 bg-zinc-200 rounded animate-pulse"></div>
                      <div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Right column skeleton */}
            <div className="md:col-span-2">
              <div className="border border-zinc-100 rounded-lg p-6">
                <div className="w-32 h-6 bg-zinc-200 rounded animate-pulse mb-4"></div>
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="w-full h-4 bg-zinc-200 rounded animate-pulse"></div>
                  ))}
                </div>
                
                <div className="mt-6">
                  <div className="w-24 h-5 bg-zinc-200 rounded animate-pulse mb-3"></div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="w-16 h-6 bg-zinc-200 rounded-full animate-pulse"></div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-8">
                  <div className="w-48 h-6 bg-zinc-200 rounded animate-pulse mb-4"></div>
                  <div className="w-full h-12 bg-zinc-200 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
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
                  <span className="font-medium">{community.nftPrice} $GROW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Membership Limit:</span>
                  <span>{memberCount !== null ? `${memberCount} / ` : ''}{community.membershipLimit} members</span>
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
              
              {/* Display warning if contract is shared with other communities */}
              {sharedContractWarning && (
                <div className="mt-3 bg-yellow-50 text-yellow-700 p-3 rounded-lg text-xs">
                  ⚠️ {sharedContractWarning}
                </div>
              )}
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
              
              {/* Add Contract Information Section */}
              <div className="mt-6">
                <h3 className="font-medium mb-2">Contract Information</h3>
                <div className="bg-zinc-50 p-3 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-1">Contract Address:</p>
                  <p className="text-sm font-mono break-all">{community.nftContractAddress}</p>
                  <div className="mt-2 text-xs text-zinc-500">
                    <p>Note: Communities sharing the same contract address can only be joined once per user.</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="font-medium mb-4">
                  {isCreator ? "Your Community" : "Join this Community"}
                </h3>
                {!activeAccount ? (
                  <div className="bg-zinc-50 p-4 rounded-lg text-center">
                    <p className="text-zinc-600 mb-4">Connect your wallet to access this community</p>
                    <ConnectButton
                      client={client}
                      appMetadata={{
                        name: "Collabr",
                        url: "https://collabr.xyz",
                      }}
                    />
                  </div>
                ) : isCreator ? (
                  <div>
                    {showPriceUpdateForm ? (
                      <div className="mb-4">
                        <h4 className="font-medium mb-2">Update Membership Price</h4>
                        <div className="mb-4 bg-yellow-50 p-4 rounded-lg text-sm text-yellow-700">
                          The contract currently has a different price than what's shown in the UI. 
                          Update the contract to match the current UI price of {community.nftPrice} $GROW?
                        </div>
                        
                        <button
                          onClick={handleUpdateMembershipPrice}
                          disabled={updatingPrice}
                          className={`w-full py-3 rounded-lg text-white transition-colors mb-3 ${
                            updatingPrice
                              ? 'bg-zinc-300 cursor-not-allowed'
                              : 'bg-[#008CFF] hover:bg-[#0070CC]'
                          }`}
                        >
                          {updatingPrice ? 'Updating Price...' : `Update to ${community.nftPrice} $GROW`}
                        </button>
                        
                        <button
                          onClick={() => setShowPriceUpdateForm(false)}
                          disabled={updatingPrice}
                          className="w-full py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          Cancel
                        </button>
                        
                        {priceUpdateError && (
                          <div className="mt-3 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                            {priceUpdateError}
                          </div>
                        )}
                        
                        {priceUpdateSuccess && (
                          <div className="mt-3 bg-green-50 text-green-600 p-3 rounded-lg text-sm">
                            Price updated successfully! Members can now purchase at the correct price.
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link href={`/communities/${communityId}/room`}>
                        <button
                          className="w-full py-3 rounded-lg text-white transition-colors bg-[#008CFF] hover:bg-[#0070CC]"
                        >
                          Enter Your Community
                        </button>
                      </Link>
                    )}
                    
                    <div className="mt-4 bg-blue-50 text-blue-600 p-4 rounded-lg text-sm">
                      As the creator of this community, you have full access to manage and participate.
                    </div>
                  </div>
                ) : isUserMember ? (
                  <div>
                    <div className="mb-4 bg-green-50 text-green-600 p-4 rounded-lg text-sm">
                      <p>You are already a member of this community!</p>
                      
                      {membershipTokenId && (
                        <div className="mt-2 border-t border-green-100 pt-2">
                          <div className="flex items-center gap-2 mt-1">
                            {/* <span>Token ID: {membershipTokenId}</span>
                            <a 
                              href={`https://sepolia-explorer.base.org/token/${community.nftContractAddress}?a=${membershipTokenId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs inline-flex items-center"
                            >
                              View on Explorer <span className="ml-1">↗</span>
                            </a> */}
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-3">
                        <Link href={`/communities/${communityId}/room`}>
                          <button className="w-full py-2 rounded-lg text-white transition-colors bg-[#008CFF] hover:bg-[#0070CC]">
                            Enter Community Room
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {purchaseStatus === 'success' ? (
                      <div className="mt-4 bg-green-50 text-green-600 p-4 rounded-lg text-sm">
                        <p>Membership purchased successfully! You are now a member of this community.</p>
                        
                        {membershipTokenId && (
                          <div className="mt-2 border-t border-green-100 pt-2">
                            <div className="flex items-center gap-2 mt-1">
                              {/* <span>Token ID: {membershipTokenId}</span>
                              <a 
                                href={`https://sepolia-explorer.base.org/token/${community.nftContractAddress}?a=${membershipTokenId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-xs inline-flex items-center"
                              >
                                View on Explorer <span className="ml-1">↗</span>
                              </a> */}
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-3">
                          <Link href={`/communities/${communityId}/room`}>
                            <button className="w-full py-2 rounded-lg text-white transition-colors bg-[#008CFF] hover:bg-[#0070CC]">
                              Enter Community Room
                            </button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <>
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
                            : `Purchase Membership for ${community.nftPrice} $GROW`}
                        </button>
                        
                        {purchaseStatus === 'error' && purchaseError && (
                          <div className="mt-4 bg-red-50 text-red-600 p-4 rounded-lg text-sm">
                            {purchaseError}
                          </div>
                        )}
                      </>
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