![tw-banner](https://github.com/thirdweb-example/next-starter/assets/57885104/20c8ce3b-4e55-4f10-ae03-2fe4743a5ee8)

# Collabr - Web3 Community Platform

Collabr is a decentralized platform for creating and managing communities with NFT-based memberships on the Base Sepolia testnet. The platform allows creators to launch their own clubs with customizable membership NFTs, now using $GROW tokens for transactions.

## Key Features

- Create and manage communities with NFT-based memberships
- Customizable membership details including price, limit, and metadata
- $GROW token integration for membership purchases (replacing ETH)
- Built on Base Sepolia testnet for low-cost transactions
- Role-based permissions for community management

## Technology Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Web3**: Thirdweb SDK
- **Backend**: Firebase (Firestore)
- **Blockchain**: Base Sepolia (Ethereum L2 testnet)
- **Smart Contracts**: Solidity (ERC-721 for NFTs, ERC-20 for $GROW token)

## $GROW Token Integration

The platform now uses $GROW tokens (ERC-20) instead of ETH for all membership transactions:

- Club creators set membership prices in $GROW tokens
- Members need to hold $GROW tokens to purchase memberships
- The LaunchMembership smart contract handles token transfers securely
- Club creators can withdraw accumulated $GROW tokens from their clubs

The $GROW token contract address is configured in the environment variables as `NEXT_PUBLIC_GROW_TOKEN_ADDRESS`.

## Installation

Install dependencies:

```bash
yarn
```

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file:

`NEXT_PUBLIC_TEMPLATE_CLIENT_ID` - Your Thirdweb client ID
`NEXT_PUBLIC_FIREBASE_API_KEY` - Your Firebase API key
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` - Your Firebase auth domain
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` - Your Firebase project ID
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` - Your Firebase storage bucket
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` - Your Firebase messaging sender ID
`NEXT_PUBLIC_FIREBASE_APP_ID` - Your Firebase app ID
`NEXT_PUBLIC_GROW_TOKEN_ADDRESS` - The address of the $GROW token contract
`NEXT_PUBLIC_LAUNCH_MEMBERSHIP_CONTRACT_ADDRESS` - The address of the LaunchMembership contract

## Development

Start development server:

```bash
yarn dev
```

Create a production build:

```bash
yarn build
```

Preview the production build:

```bash
yarn start
```

## Smart Contracts

The platform uses two main smart contracts:

1. **LaunchMembership**: Handles club creation, membership NFTs, and $GROW token payments
2. **$GROW Token**: ERC-20 token used for all platform transactions

## Resources

- [Thirdweb Documentation](https://portal.thirdweb.com/typescript/v5)
- [Base Sepolia Testnet](https://docs.base.org/tools/network-faucets)
- [ERC-20 Token Standard](https://ethereum.org/en/developers/docs/standards/tokens/erc-20/)
- [ERC-721 NFT Standard](https://ethereum.org/en/developers/docs/standards/tokens/erc-721/)

## Need help?

For help or feedback, please [visit our support site](https://thirdweb.com/support)
