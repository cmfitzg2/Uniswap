const { ChainId, Fetcher, WETH, Route, Pair, Trade, Token, TokenAmount, TradeType, Percent } = require('@uniswap/sdk');
const ethers = require('ethers');
const yesno = require('yesno');

const chainId = ChainId.MAINNET;
//input = COMP, output = MKR
const multiplier = 1e18;
const gweiMultiplier = 1e9;
const gasFee = 162;
const inputTokenAddress = '0xc00e94Cb662C3520282E6f5717214004A7f26888';
const inputTokenSymbol = 'COMP';
const outputTokenAddress = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2';
const outputTokenSymbol = 'MKR';
const creditAddress = '0xCd00Af663dBDd67Dc16C200a84675A9536d3a2b1';
const desiredInputAmount = (.02 * multiplier).toString();
const expirationTime = Math.floor(Date.now() / 1000) + 60 * 30;
const privKey = '9add5d460d672f072c0fa7354be1747694eb27a913ab7ed37f6bb3d6216b99bd'

const init = async () => {
	
	const outputToken = await Fetcher.fetchTokenData(chainId, outputTokenAddress)
	const inputToken = await Fetcher.fetchTokenData(chainId, inputTokenAddress)
	const weth = WETH[chainId]
	const inputTokenEthPair = await Fetcher.fetchPairData(inputToken, weth)
	const ethOutputTokenPair = await Fetcher.fetchPairData(outputToken, weth)
	const route = new Route([inputTokenEthPair, ethOutputTokenPair], inputToken)
	try {
		const trade = new Trade(route, new TokenAmount(inputToken, desiredInputAmount), TradeType.EXACT_INPUT)
		console.log("Sending " + trade.inputAmount.toSignificant(6) + " " + inputTokenSymbol)
		console.log("Receiving " + trade.outputAmount.toSignificant(6) + " " + outputTokenSymbol)
		console.log("Execution price: " + trade.executionPrice.toSignificant(6) + " " + inputTokenSymbol)
		console.log("Mid price: " + trade.nextMidPrice.toSignificant(6))
		
		const slippageTolerance = new Percent('50', '10000'); //50 bips
		const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw;
		console.log("Minimum amount out: " + amountOutMin / multiplier)
		const path = [inputToken.address, weth.address, outputToken.address];
		const to = creditAddress;
		const deadline = expirationTime
		const value = trade.inputAmount.raw;
		const inputAmountHex = ethers.BigNumber.from(value.toString()).toHexString(); 
		const amountOutMinHex = ethers.BigNumber.from(amountOutMin.toString()).toHexString();
		console.log(inputAmountHex);
		console.log(amountOutMinHex);
		const provider = ethers.getDefaultProvider('mainnet', {
			infura: 'https://mainnet.infura.io/v3/f49e6c05d6814347a848da44864f8e9d'
		});
		//let gasPrice = await provider.getGasPrice();
		let gasPrice = '0x' + ((gasFee * gweiMultiplier).toString(16))
		gasPrice = ethers.BigNumber.from(gasPrice)
		console.log(gasPrice)
		const account = new ethers.Wallet(privKey, provider);		
		const uniswap = new ethers.Contract(
			'0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
			['function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'],
			account
		);
		const confirmation = await yesno({
			question: 'Are you sure you want to continue?'
		});

		if (confirmation) {
			const tx = await uniswap.swapExactTokensForTokens(
				inputAmountHex,
				amountOutMinHex,
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
				console.log('Transaction was mined in block ${receipt.blockNumber}');
			}
		}
	} catch (error) {
		console.error(error)
	}
}

init();
