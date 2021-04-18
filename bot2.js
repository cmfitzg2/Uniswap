const { ChainId, Fetcher, WETH, Route, Pair, Trade, Token, TokenAmount, TradeType, Percent, FACTORY_ADDRESS, INIT_CODE_HASH } = require('@uniswap/sdk');
const { InfuraProvider } = require('@ethersproject/providers');
const fs = require('fs');
const ethers = require('ethers');
const yesno = require('yesno');

//Constants
const chainId = ChainId.MAINNET;
const gweiMultiplier = 1e9;
let expirationTime = Math.floor(Date.now() / 1000) + 60;

//Change these
//20 = minutes until order expires
expirationTime = expirationTime * 20;
//How much we're spending in USDC
const desiredInputAmount = 50;
//Gwei
const gasFee = 90;

//Change recipient address:
const addresses = {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
	USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
	outputToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
	factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', 
	router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
	recipient: '0x713cC41082d2f2446f66AE69860eF98D172b64CB'
}

//Private data
let data = JSON.parse(fs.readFileSync('secret.json'));
const privKey = data.PRIVATE_KEY;
const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
let provider = InfuraProvider.getWebSocketProvider("homestead", {
        projectId: 'f49e6c05d6814347a848da44864f8e9d'
});

const wallet = new ethers.Wallet(Buffer.from(privKey, "hex"));
const account = wallet.connect(provider);

const factory = new ethers.Contract(
    addresses.factory,
    ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
    account
);

const router = new ethers.Contract(
    addresses.router,
    [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
    ],
    account
);

factory.on('PairCreated', async (token0, token1, pairAddress) => {
    console.log(`
        New pair detected
        =================
        token0: ${token0}
        token1: ${token1}
        pairAddress: ${pairAddress}
    `);

    //The quote currency needs to be WETH (we will pay with USDC)
    let tokenIn, tokenOut;
    if (token0 == addresses.WETH) {
        tokenIn = token0; 
        tokenOut = token1;
		console.log("Token 0 is WETH");
    }

    if (token1 == addresses.WETH) {
        tokenIn = token1; 
        tokenOut = token0;
		console.log("Token 1 is WETH");
    }

    //The quote currency is not WETH
    if (typeof tokenIn === 'undefined') {
	console.log("New token is not denominated in WETH");
        return;
    }

	//const outputToken = await Fetcher.fetchTokenData(chainId, addresses.outputToken, provider);
	const outputToken = await Fetcher.fetchTokenData(chainId, tokenOut, provider);
	const inputToken = await Fetcher.fetchTokenData(chainId, addresses.USDC, provider);
	const desiredInputAmountAdjusted = (desiredInputAmount * (10 ** inputToken.decimals)).toString();
	const weth = WETH[chainId];
	const inputTokenEthPair = await Fetcher.fetchPairData(inputToken, weth, provider);
	const ethOutputTokenPair = await Fetcher.fetchPairData(outputToken, weth, provider)
	const route = new Route([inputTokenEthPair, ethOutputTokenPair], inputToken)
	try {
		const trade = new Trade(route, new TokenAmount(inputToken, desiredInputAmountAdjusted), TradeType.EXACT_INPUT)
		console.log("Sending " + trade.inputAmount.toSignificant(6) + " USDC");
		console.log("Receiving " + trade.outputAmount.toSignificant(6) + " " + outputToken.address);
		console.log("Execution price: " + trade.executionPrice.invert().toSignificant(6) + " USDC");
		console.log("Mid price: " + trade.nextMidPrice.invert().toSignificant(6))

		const slippageTolerance = new Percent('10', '100'); //10% slippage
		const amountOutGuaranteed = trade.minimumAmountOut(slippageTolerance).raw;
		console.log("Minimum amount out: " + amountOutGuaranteed / (10 ** outputToken.decimals))
		const path = [inputToken.address, weth.address, outputToken.address];
		const to = addresses.recipient;
		const deadline = expirationTime
		const value = trade.inputAmount.raw;
		const amountIn = ethers.BigNumber.from(value.toString()).toHexString(); 
		const amountOutMin = ethers.BigNumber.from(amountOutGuaranteed.toString()).toHexString();
		//let gasPrice = await provider.getGasPrice();
		console.log("Gas Price: " + gasFee + " gwei");
		let gasPrice = '0x' + ((gasFee * gweiMultiplier).toString(16))
		gasPrice = ethers.BigNumber.from(gasPrice)
		const wallet = new ethers.Wallet(Buffer.from(privKey, "hex"));
		const signer = wallet.connect(provider);
		if (outputToken.address == addresses.outputToken) {
			const confirmation = await yesno({
				question: 'Are you sure you want to continue?'
			});

			if (confirmation) {
				const uniswap = new ethers.Contract(
					uniswapRouterAddress,
					['function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'],
					signer
			);
				const tx = await uniswap.swapExactTokensForTokens(
					amountIn,
					amountOutMin,
					path,
					to,
					deadline,
					{
						gasPrice: gasPrice,
						gasLimit: ethers.BigNumber.from(300000).toHexString()
					}
				);
				
				console.log('Transaction hash: ' + tx.hash);

				const receipt = await tx.wait();
				if (null == receipt) {
					console.log("Transaction failed!");
				} else {
					console.log('Transaction was mined in block ' + receipt.blockNumber);
				}
			}
		} else {
			console.log("New token is not of desired type.");
		}
	} catch (error) {
		console.error(error);
	}
});