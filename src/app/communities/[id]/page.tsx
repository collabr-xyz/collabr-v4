"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "../../client";

// Mock data for communities
const MOCK_COMMUNITIES = [
  {
    id: "1",
    name: "DeFi Innovators",
    description: "A community focused on decentralized finance innovations and strategies.",
    members: 1243,
    image: "https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=2832&auto=format&fit=crop",
    tags: ["DeFi", "Finance", "Yield Farming"],
    channels: ["general", "yield-strategies", "protocol-analysis", "trading"]
  },
  {
    id: "2",
    name: "NFT Creators",
    description: "Connect with artists and collectors in the NFT space.",
    members: 892,
    image: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=2874&auto=format&fit=crop",
    tags: ["NFT", "Art", "Collectibles"],
    about: "NFT Creators brings together artists, collectors, and enthusiasts to explore the evolving world of digital art and collectibles. Share your work, discover new artists, and discuss the future of NFTs.",
    rules: [
      "Respect intellectual property rights",
      "No hate speech or offensive content",
      "Constructive criticism only",
      "No excessive self-promotion"
    ]
  },
  {
    id: "3",
    name: "DAO Governance",
    description: "Discuss and participate in decentralized autonomous organization governance.",
    members: 567,
    image: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2832&auto=format&fit=crop",
    tags: ["DAO", "Governance", "Voting"],
    about: "DAO Governance is a community focused on the principles and practices of decentralized autonomous organizations. We discuss governance models, voting mechanisms, treasury management, and DAO tooling.",
    rules: [
      "Focus on governance, not token price",
      "Be respectful of different governance models",
      "Back claims with evidence when possible",
      "No spam or irrelevant content"
    ]
  },
  {
    id: "4",
    name: "Web3 Developers",
    description: "A hub for blockchain and Web3 developers to collaborate on projects.",
    members: 1876,
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2834&auto=format&fit=crop",
    tags: ["Development", "Coding", "Web3"],
    about: "Web3 Developers is a community for builders creating the decentralized web. Share knowledge, get help with technical challenges, find collaborators, and stay updated on the latest tools and frameworks.",
    rules: [
      "Share code with proper formatting",
      "Be specific when asking for help",
      "No recruitment posts without admin approval",
      "Give credit when using others' code"
    ]
  },
  {
    id: "5",
    name: "Crypto Traders",
    description: "Share trading strategies and market analysis with fellow traders.",
    members: 2341,
    image: "https://images.unsplash.com/photo-1621761191319-c6fb62004040?q=80&w=2787&auto=format&fit=crop",
    tags: ["Trading", "Market Analysis", "Investment"],
    about: "Crypto Traders is a community for discussing trading strategies, technical analysis, market trends, and risk management in cryptocurrency markets. Share insights and learn from experienced traders.",
    rules: [
      "No financial advice - educational purposes only",
      "Be transparent about conflicts of interest",
      "No pump and dump schemes or market manipulation",
      "Respect different trading philosophies"
    ]
  }
];

// Mock community members
const MOCK_MEMBERS = [
  { id: "m1", address: "0x1234...5678", name: "DeFi_Wizard", status: "online", role: "admin" },
  { id: "m2", address: "0xabcd...ef01", name: "YieldHunter", status: "online", role: "moderator" },
  { id: "m3", address: "0x7890...1234", name: "Liquidator_Bot", status: "offline", role: "member" },
  { id: "m4", address: "0x2468...1357", name: "ETH_Maxi", status: "online", role: "member" },
  { id: "m5", address: "0x1357...2468", name: "DeFi_Researcher", status: "idle", role: "member" },
  { id: "m6", address: "0x9876...5432", name: "Gwei_Saver", status: "offline", role: "member" },
  { id: "m7", address: "0x5432...9876", name: "Flashloan_Dev", status: "online", role: "member" },
  { id: "m8", address: "0x1111...2222", name: "MEV_Hunter", status: "idle", role: "member" },
  { id: "m9", address: "0x3333...4444", name: "Stablecoin_Stan", status: "online", role: "member" },
  { id: "m10", address: "0x5555...6666", name: "Gas_Optimizer", status: "offline", role: "member" },
  { id: "m11", address: "0x7777...8888", name: "Solidity_Expert", status: "online", role: "member" },
  { id: "m12", address: "0x9999...0000", name: "Governance_Voter", status: "online", role: "member" },
];

// Mock messages
const MOCK_MESSAGES = [
  {
    id: "msg1",
    channelId: "general",
    communityId: "1",
    sender: "DeFi_Wizard",
    senderAddress: "0x1234...5678",
    content: "Hey everyone! Welcome to the DeFi Innovators community. Excited to discuss the latest in decentralized finance with all of you.",
    timestamp: "2023-08-15T14:32:00Z",
    reactions: [{ emoji: "👋", count: 5 }]
  },
  {
    id: "msg2",
    channelId: "general",
    communityId: "1",
    sender: "YieldHunter",
    senderAddress: "0xabcd...ef01",
    content: "Thanks for setting this up! I've been exploring some new yield farming strategies on Arbitrum that I'd love to share with the group.",
    timestamp: "2023-08-15T14:35:00Z",
    reactions: [{ emoji: "🚀", count: 3 }]
  },
  {
    id: "msg3",
    channelId: "general",
    communityId: "1",
    sender: "ETH_Maxi",
    senderAddress: "0x2468...1357",
    content: "Has anyone been following the latest Ethereum upgrades? The improvements to layer 2 scaling solutions are looking promising.",
    timestamp: "2023-08-15T14:40:00Z",
    reactions: []
  },
  {
    id: "msg4",
    channelId: "general",
    communityId: "1",
    sender: "Liquidator_Bot",
    senderAddress: "0x7890...1234",
    content: "Just a reminder to everyone to keep an eye on your collateralization ratios with the recent market volatility. Stay safe out there!",
    timestamp: "2023-08-15T14:45:00Z",
    reactions: [{ emoji: "👍", count: 7 }]
  },
  {
    id: "msg5",
    channelId: "general",
    communityId: "1",
    sender: "DeFi_Researcher",
    senderAddress: "0x1357...2468",
    content: "I just published a research paper on the efficiency of various AMM models. Would love to get your thoughts: https://example.com/amm-research",
    timestamp: "2023-08-15T14:50:00Z",
    reactions: [{ emoji: "🧠", count: 4 }, { emoji: "📝", count: 2 }]
  },
  {
    id: "msg6",
    channelId: "general",
    communityId: "1",
    sender: "Gwei_Saver",
    senderAddress: "0x9876...5432",
    content: "Gas prices are unusually low right now if anyone has pending transactions they've been waiting to execute.",
    timestamp: "2023-08-15T15:00:00Z",
    reactions: [{ emoji: "⛽", count: 3 }]
  },
  {
    id: "msg7",
    channelId: "general",
    communityId: "1",
    sender: "Flashloan_Dev",
    senderAddress: "0x5432...9876",
    content: "Working on a new flashloan aggregator that optimizes across multiple protocols. Anyone interested in beta testing?",
    timestamp: "2023-08-15T15:10:00Z",
    reactions: [{ emoji: "🔥", count: 5 }]
  },
  {
    id: "msg8",
    channelId: "general",
    communityId: "1",
    sender: "MEV_Hunter",
    senderAddress: "0x1111...2222",
    content: "Interesting MEV opportunity I noticed today: there's a significant price discrepancy between Curve and Uniswap for the ETH/USDC pair.",
    timestamp: "2023-08-15T15:20:00Z",
    reactions: [{ emoji: "👀", count: 6 }]
  },
];

// Mock user data
const MOCK_USER_COMMUNITIES = ["1", "3"]; // IDs of communities the user has joined

export default function CommunityDetail() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.id as string;
  const activeAccount = useActiveAccount();
  const [isJoined, setIsJoined] = useState(false);
  const [activeChannel, setActiveChannel] = useState("general");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<typeof MOCK_MESSAGES>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Find the community data
  const community = MOCK_COMMUNITIES.find(c => c.id === communityId);
  
  // Get members for this community (in a real app, this would be filtered)
  const communityMembers = MOCK_MEMBERS;
  
  // Check if user has joined this community
  useEffect(() => {
    setIsJoined(MOCK_USER_COMMUNITIES.includes(communityId));
  }, [communityId]);
  
  // Load messages for the active channel
  useEffect(() => {
    if (community) {
      const channelMessages = MOCK_MESSAGES.filter(
        msg => msg.communityId === communityId && msg.channelId === activeChannel
      );
      setMessages(channelMessages);
    }
  }, [communityId, activeChannel]);
  
  // Scroll to bottom of messages when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Handle joining the community
  const handleJoinCommunity = () => {
    // In a real app, you would call an API to join the community
    setIsJoined(true);
  };
  
  // Handle sending a message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeAccount) return;
    
    // In a real app, you would send this to an API
    const newMessage = {
      id: `msg${Date.now()}`,
      channelId: activeChannel,
      communityId: communityId,
      sender: activeAccount.address.slice(0, 6) + "..." + activeAccount.address.slice(-4),
      senderAddress: activeAccount.address,
      content: message,
      timestamp: new Date().toISOString(),
      reactions: []
    };
    
    setMessages(prev => [...prev, newMessage]);
    setMessage("");
  };
  
  // If community not found
  if (!community) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium mb-4">Community not found</h2>
          <p className="text-zinc-500 mb-6">The community you're looking for doesn't exist or has been removed.</p>
          <Link href="/communities" className="text-sm text-zinc-600 border border-zinc-200 px-4 py-2 rounded-full hover:bg-zinc-50 transition-colors">
            Back to Communities
          </Link>
        </div>
      </div>
    );
  }

  // Group members by status for the sidebar
  const onlineMembers = communityMembers.filter(m => m.status === "online");
  const idleMembers = communityMembers.filter(m => m.status === "idle");
  const offlineMembers = communityMembers.filter(m => m.status === "offline");

  return (
    <main className="h-screen bg-white text-zinc-900 flex flex-col overflow-hidden">
      {/* Top navigation bar */}
      <div className="border-b border-zinc-200 py-3 px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/communities')}
            className="text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="font-medium">{community.name}</h1>
        </div>
        <ConnectButton
          client={client}
          appMetadata={{
            name: "Collabr",
            url: "https://collabr.xyz",
          }}
        />
      </div>
      
      {/* Main content area - Discord-like interface */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Channels */}
        <div className="w-56 border-r border-zinc-200 flex-shrink-0 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-zinc-500">CHANNELS</h2>
              <button className="text-zinc-400 hover:text-zinc-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <div className="space-y-1">
              {community.channels?.map(channel => (
                <button
                  key={channel}
                  onClick={() => setActiveChannel(channel)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center ${
                    activeChannel === channel
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <span className="mr-2">#</span>
                  {channel}
                </button>
              ))}
            </div>
          </div>
          
          {!isJoined && (
            <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200">
              <button 
                onClick={handleJoinCommunity}
                className="w-full bg-zinc-900 text-white px-3 py-2 rounded text-sm hover:bg-zinc-800 transition-colors"
              >
                Join Community
              </button>
            </div>
          )}
        </div>
        
        {/* Middle - Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Channel header */}
          <div className="border-b border-zinc-200 py-3 px-4">
            <div className="flex items-center">
              <span className="text-lg mr-2">#</span>
              <h2 className="font-medium">{activeChannel}</h2>
            </div>
          </div>
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-full bg-zinc-100 flex-shrink-0 flex items-center justify-center text-zinc-500 font-medium text-sm">
                  {msg.sender.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{msg.sender}</span>
                    <span className="text-xs text-zinc-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-zinc-700 mt-1">{msg.content}</p>
                  
                  {/* Reactions */}
                  {msg.reactions.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {msg.reactions.map((reaction, index) => (
                        <button 
                          key={index}
                          className="flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 rounded-full px-2 py-0.5 text-xs"
                        >
                          <span>{reaction.emoji}</span>
                          <span>{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Message actions - only visible on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button className="text-zinc-400 hover:text-zinc-600 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904" />
                    </svg>
                  </button>
                  <button className="text-zinc-400 hover:text-zinc-600 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            
            {/* Empty state */}
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-zinc-500">
                  <p className="mb-2">No messages in #{activeChannel} yet</p>
                  <p className="text-sm">Be the first to send a message!</p>
                </div>
              </div>
            )}
            
            {/* Invisible element to scroll to */}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Message input */}
          <div className="border-t border-zinc-200 p-4">
            {isJoined ? (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Message #${activeChannel}`}
                  className="flex-1 border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button 
                  type="submit"
                  disabled={!message.trim() || !activeAccount}
                  className="bg-zinc-900 text-white p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </form>
            ) : (
              <div className="bg-zinc-50 p-3 rounded-md text-center">
                <p className="text-zinc-500 text-sm mb-2">You need to join this community to send messages</p>
                <button 
                  onClick={handleJoinCommunity}
                  className="bg-zinc-900 text-white px-4 py-1.5 rounded text-sm hover:bg-zinc-800 transition-colors"
                >
                  Join Community
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Right sidebar - Members list */}
        <div className="w-60 border-l border-zinc-200 flex-shrink-0 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-zinc-500 mb-4">MEMBERS — {communityMembers.length}</h2>
            
            {/* Online members */}
            {onlineMembers.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-2">ONLINE — {onlineMembers.length}</h3>
                <div className="space-y-2">
                  {onlineMembers.map(member => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-medium text-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white"></div>
                      </div>
                      <span className="text-sm truncate">{member.name}</span>
                      {member.role === "admin" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Admin</span>
                      )}
                      {member.role === "moderator" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Mod</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Idle members */}
            {idleMembers.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-2">IDLE — {idleMembers.length}</h3>
                <div className="space-y-2">
                  {idleMembers.map(member => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-medium text-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-yellow-500 border-2 border-white"></div>
                      </div>
                      <span className="text-sm truncate">{member.name}</span>
                      {member.role === "admin" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Admin</span>
                      )}
                      {member.role === "moderator" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Mod</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Offline members */}
            {offlineMembers.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-zinc-400 mb-2">OFFLINE — {offlineMembers.length}</h3>
                <div className="space-y-2">
                  {offlineMembers.map(member => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-medium text-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white"></div>
                      </div>
                      <span className="text-sm text-zinc-400 truncate">{member.name}</span>
                      {member.role === "admin" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Admin</span>
                      )}
                      {member.role === "moderator" && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">Mod</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
} 