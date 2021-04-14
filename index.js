const { ChainId, Fetcher, WETH, Route, Pair, Trade, Token, TokenAmount, TradeType, Percent, FACTORY_ADDRESS, INIT_CODE_HASH } = require('@uniswap/sdk');
const { pack, keccak256 } = require('@ethersproject/solidity');
const { getCreate2Address } = require('@ethersproject/address');


const ethers = require('ethers');
const yesno = require('yesno');

const chainId = ChainId.MAINNET;
const gweiMultiplier = 1e9;
const gasFee = 90;
//input = USDC, output = GRT
const inputTokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const inputTokenSymbol = 'USDC';
const desiredInputAmount = 50;
const outputTokenAddress = '0xc55c2175E90A46602fD42e931f62B3Acc1A013Ca';
const outputTokenSymbol = 'FAKE';
const creditAddress = '0x713cC41082d2f2446f66AE69860eF98D172b64CB';
const expirationTime = Math.floor(Date.now() / 1000) + 60 * 30;
const privKey = 'GOES HERE'
const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'

const init = async () => {
	const outputToken = await Fetcher.fetchTokenData(chainId, outputTokenAddress);
	const inputToken = await Fetcher.fetchTokenData(chainId, inputTokenAddress);
	const desiredInputAmountAdjusted = (desiredInputAmount * (10 ** inputToken.decimals)).toString();
	const weth = WETH[chainId];
	const inputTokenEthPair = await Fetcher.fetchPairData(inputToken, weth);
	let ready = false;
	try {
		await Fetcher.fetchPairData(outputToken, weth)
		console.log("Available");
		ready = true;
	} catch (error) {
		console.log("Not available yet");
		sleep(1000);
		init();
	}
	if (ready) {
		const ethOutputTokenPair = await Fetcher.fetchPairData(outputToken, weth)
		const route = new Route([inputTokenEthPair, ethOutputTokenPair], inputToken)
		try {
			const trade = new Trade(route, new TokenAmount(inputToken, desiredInputAmountAdjusted), TradeType.EXACT_INPUT)
			console.log("Sending " + trade.inputAmount.toSignificant(6) + " " + inputTokenSymbol)
			console.log("Receiving " + trade.outputAmount.toSignificant(6) + " " + outputTokenSymbol)
			console.log("Execution price: " + trade.executionPrice.toSignificant(6) + " " + inputTokenSymbol)
			console.log("Mid price: " + trade.nextMidPrice.toSignificant(6))
			
			const slippageTolerance = new Percent('50', '10000'); //50 bips
			const amountOutGuaranteed = trade.minimumAmountOut(slippageTolerance).raw;
			console.log("Minimum amount out: " + amountOutGuaranteed / (10 ** outputToken.decimals))
			const path = [inputToken.address, weth.address, outputToken.address];
			const to = creditAddress;
			const deadline = expirationTime
			const value = trade.inputAmount.raw;
			const amountIn = ethers.BigNumber.from(value.toString()).toHexString(); 
			const amountOutMin = ethers.BigNumber.from(amountOutGuaranteed.toString()).toHexString();
			const provider = ethers.getDefaultProvider('mainnet', {
				infura: 'https://mainnet.infura.io/v3/f49e6c05d6814347a848da44864f8e9d'
			});
			//let gasPrice = await provider.getGasPrice();
			console.log("Gas Price: " + gasFee + " gwei");
			let gasPrice = '0x' + ((gasFee * gweiMultiplier).toString(16))
			gasPrice = ethers.BigNumber.from(gasPrice)
			const wallet = new ethers.Wallet(Buffer.from(privKey, "hex"));
			const signer = wallet.connect(provider);
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
		} catch (error) {
			console.error(error)
		}
	}
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

init();