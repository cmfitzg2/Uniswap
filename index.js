const { ChainId, Fetcher, WETH, Route, Pair, Trade, Token, TokenAmount, TradeType, Percent, FACTORY_ADDRESS, INIT_CODE_HASH } = require('@uniswap/sdk');
const { InfuraProvider } = require('@ethersproject/providers');
const fs = require('fs');
const ethers = require('ethers');
const yesno = require('yesno');

//Constants
const chainId = ChainId.MAINNET;
const gweiMultiplier = 1e9;
let expirationTime = Math.floor(Date.now() / 1000) + 60;
//USDC address
const inputTokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const inputTokenSymbol = 'USDC';

/**
 * Change these *
 */
//The token we're trying to buy
const outputTokenAddress = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
//Its ticker symbol -- only used to display data to user, can be anything.
const outputTokenSymbol = 'WBTC';
//The public address of our wallet
const creditAddress = '0x713cC41082d2f2446f66AE69860eF98D172b64CB';
//20 = minutes until order expires
expirationTime = expirationTime * 20;
//How much we're spending in USDC
const desiredInputAmount = 50;
//Highest price we're willing to pay (in USD) without accounting for slippage
const maxPriceWithoutSlippage = 50000;
//Gwei
const gasFee = 90;
const gasLimit = 300000;
//Manual confirmation required flag
const manualConfirm = true;

//Private data
let data = JSON.parse(fs.readFileSync('secret.json'));
const privKey = data.PRIVATE_KEY;
const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const provider = new InfuraProvider("homestead", {
    projectId: 'f49e6c05d6814347a848da44864f8e9d',
    projectSecret: data.INFURA_KEY
});

const waitAvailability = async (skipOutput) => {
	const outputToken = await Fetcher.fetchTokenData(chainId, outputTokenAddress, provider);
	const inputToken = await Fetcher.fetchTokenData(chainId, inputTokenAddress, provider);
	const desiredInputAmountAdjusted = (desiredInputAmount * (10 ** inputToken.decimals)).toString();
	const weth = WETH[chainId];
	const inputTokenEthPair = await Fetcher.fetchPairData(inputToken, weth, provider);
	try {
		await Fetcher.fetchPairData(outputToken, weth, provider)
		if (!skipOutput) {
			console.log("Available");
		}
		attemptTrade(outputToken, inputToken, desiredInputAmountAdjusted, weth, inputTokenEthPair);
	} catch (error) {
		console.log("Not available yet");
		sleep(50);
		waitAvailability(false);
	}
}
const attemptTrade = async (outputToken, inputToken, desiredInputAmountAdjusted, weth, inputTokenEthPair) => {

	const ethOutputTokenPair = await Fetcher.fetchPairData(outputToken, weth, provider)
	const route = new Route([inputTokenEthPair, ethOutputTokenPair], inputToken)
	try {
		const trade = new Trade(route, new TokenAmount(inputToken, desiredInputAmountAdjusted), TradeType.EXACT_INPUT)
		if (trade.executionPrice.invert().toSignificant(18) > maxPriceWithoutSlippage) {
			console.log("Current market price (" + trade.executionPrice.invert().toSignificant(6) + ") exceeds max threshold (" + maxPriceWithoutSlippage.toPrecision(6) + ")");
			sleep(50);
			waitAvailability(true);
		} else {
			console.log("Sending " + trade.inputAmount.toSignificant(6) + " " + inputTokenSymbol)
			console.log("Receiving " + trade.outputAmount.toSignificant(6) + " " + outputTokenSymbol)
			console.log("Execution price: " + trade.executionPrice.invert().toSignificant(6) + " " + inputTokenSymbol)
			console.log("Mid price: " + trade.nextMidPrice.invert().toSignificant(6))
			const slippageTolerance = new Percent('10', '100'); //10% slippage allowed
			const amountOutGuaranteed = trade.minimumAmountOut(slippageTolerance).raw;
			console.log("Minimum amount out: " + amountOutGuaranteed / (10 ** outputToken.decimals))
			const path = [inputToken.address, weth.address, outputToken.address];
			const to = creditAddress;
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
			if (manualConfirm) {
				const confirmation = await yesno({
					question: 'Are you sure you want to continue?'
				});
			}
			if (confirmation || manualConfirm == false) {
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
						gasLimit: ethers.BigNumber.from(gasLimit).toHexString()
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
		}
	} catch (error) {
		console.error(error)
	}
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

waitAvailability(false);