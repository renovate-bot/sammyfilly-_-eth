import BigNumber from 'bignumber.js'
import {
  add,
  curry,
  flatten,
  head,
  last,
  lift,
  map,
  not,
  pathOr,
  reduce,
  reject,
  toPairs
} from 'ramda'

import { Exchange, Remote } from 'blockchain-wallet-v4/src'
import {
  CoinfigType,
  ExtractSuccess,
  InterestAccountBalanceType,
  RatesType,
  RemoteDataType,
  SBBalancesType,
  SBBalanceType,
  SwapOrderType,
  WalletFiatEnum,
  WalletFiatType
} from 'blockchain-wallet-v4/src/types'
import { createDeepEqualSelector } from 'blockchain-wallet-v4/src/utils'
import { selectors } from 'data'
import { convertBaseToStandard } from 'data/components/exchange/services'
import { DEFAULT_SB_BALANCE } from 'data/components/simpleBuy/model'
import { getOutputFromPair } from 'data/components/swap/model'
import { RootState } from 'data/rootReducer'

import {
  getErc20NonCustodialBalance,
  getEthBalance as getEthNonCustodialBalance,
  getXlmBalance as getXlmNonCustodialBalance
} from './nonCustodial/selectors'

export const getCoinCustodialBalance = (
  coin: string
): ((state: RootState) => RemoteDataType<string, BigNumber>) =>
  createDeepEqualSelector(
    [
      selectors.components.simpleBuy.getSBBalances,
      selectors.components.interest.getInterestAccountBalance
    ],
    (
      sbBalancesR: RemoteDataType<string, SBBalancesType>,
      interestAccountBalanceR: RemoteDataType<string, InterestAccountBalanceType>
    ) => {
      const sbCoinBalance = sbBalancesR.getOrElse({
        [coin]: DEFAULT_SB_BALANCE
      })[coin]
      const interestCoinBalance = interestAccountBalanceR.getOrElse({
        [coin]: { balance: '0' } as InterestAccountBalanceType[typeof coin]
      })[coin]
      const sbBalance = sbCoinBalance ? sbCoinBalance.available : '0'
      const interestBalance = interestCoinBalance ? interestCoinBalance.balance : '0'

      return Remote.of(new BigNumber(sbBalance).plus(new BigNumber(interestBalance)))
    }
  )

export const getBtcBalance = createDeepEqualSelector(
  [
    selectors.core.wallet.getSpendableContext,
    selectors.core.data.btc.getAddresses,
    getCoinCustodialBalance('BTC')
  ],
  (context, addressesR, custodialBalanceR) => {
    const contextToBalances = (
      context,
      balances,
      custodialBalance: ExtractSuccess<typeof custodialBalanceR>
    ): Array<number> => {
      const walletBalances: Array<number> = flatten(context).map((a) =>
        pathOr(0, [a, 'final_balance'], balances)
      )
      return walletBalances.concat(custodialBalance.toNumber())
    }
    const balancesR = lift(contextToBalances)(Remote.of(context), addressesR, custodialBalanceR)
    return balancesR.map(reduce<number, number>(add, 0))
  }
)

export const getBchBalance = createDeepEqualSelector(
  [
    selectors.core.kvStore.bch.getSpendableContext,
    selectors.core.data.bch.getAddresses,
    getCoinCustodialBalance('BCH')
  ],
  (context, addressesR, custodialBalanceR) => {
    const contextToBalances = (
      context,
      balances,
      custodialBalance: ExtractSuccess<typeof custodialBalanceR>
    ) => {
      const walletBalances: Array<number> = context.map((a) =>
        pathOr(0, [a, 'final_balance'], balances)
      )
      return walletBalances.concat(custodialBalance.toNumber())
    }
    const balancesR = lift(contextToBalances)(Remote.of(context), addressesR, custodialBalanceR)
    return balancesR.map(reduce<number, number>(add, 0))
  }
)

export const getEthBalance = createDeepEqualSelector(
  [getEthNonCustodialBalance, getCoinCustodialBalance('ETH')],
  (balancesR, custodialBalanceR) => {
    const custodialBalance = custodialBalanceR.getOrElse(new BigNumber(0))

    return Remote.of(new BigNumber(balancesR.getOrElse(new BigNumber(0))).plus(custodialBalance))
  }
)

export const getErc20Balance = (coin: string) =>
  createDeepEqualSelector(
    [getErc20NonCustodialBalance(coin), getCoinCustodialBalance(coin)],
    (balanceR, custodialBalanceR) => {
      const custodialBalance = custodialBalanceR.getOrElse(new BigNumber(0))

      return Remote.of(new BigNumber(balanceR.getOrElse(0)).plus(custodialBalance))
    }
  )

export const getXlmBalance = createDeepEqualSelector(
  [getXlmNonCustodialBalance, getCoinCustodialBalance('XLM')],
  (balanceR, custodialBalanceR) => {
    const custodialBalance = custodialBalanceR.getOrElse(new BigNumber(0))

    return Remote.of(new BigNumber(balanceR.getOrElse(0)).plus(custodialBalance))
  }
)

export const getFiatBalance = curry(
  (
    currency: WalletFiatType,
    state: RootState
  ): RemoteDataType<string, SBBalanceType['available']> => {
    const sbBalancesR = selectors.components.simpleBuy.getSBBalances(state)
    const fiatBalance =
      sbBalancesR.getOrElse({
        [currency]: DEFAULT_SB_BALANCE
      })[currency]?.available || '0'
    return Remote.of(convertBaseToStandard('FIAT', fiatBalance))
  }
)

export const getWithdrawableFiatBalance = curry(
  (
    currency: WalletFiatType,
    state: RootState
  ): RemoteDataType<string, SBBalanceType['withdrawable']> => {
    const sbBalancesR = selectors.components.simpleBuy.getSBBalances(state)
    const fiatBalance =
      sbBalancesR.getOrElse({
        [currency]: DEFAULT_SB_BALANCE
      })[currency]?.withdrawable || '0'
    return Remote.of(convertBaseToStandard('FIAT', fiatBalance))
  }
)

export const getBtcBalanceInfo = createDeepEqualSelector(
  [
    getBtcBalance,
    selectors.core.settings.getCurrency,
    (state: RootState) => selectors.core.data.coins.getRates('BTC', state)
  ],
  (btcBalanceR, currencyR, btcRatesR) => {
    const transform = (value, rates, toCurrency) =>
      Exchange.convertCoinToFiat({ coin: 'BTC', currency: toCurrency, rates, value })
    return lift(transform)(btcBalanceR, btcRatesR, currencyR)
  }
)

export const getBchBalanceInfo = createDeepEqualSelector(
  [
    getBchBalance,
    selectors.core.settings.getCurrency,
    (state: RootState) => selectors.core.data.coins.getRates('BCH', state)
  ],
  (bchBalanceR, currencyR, bchRatesR) => {
    const transform = (value, rates, toCurrency) =>
      Exchange.convertCoinToFiat({ coin: 'BCH', currency: toCurrency, rates, value })
    return lift(transform)(bchBalanceR, bchRatesR, currencyR)
  }
)

export const getEthBalanceInfo = createDeepEqualSelector(
  [
    getEthBalance,
    selectors.core.settings.getCurrency,
    (state: RootState) => selectors.core.data.coins.getRates('ETH', state)
  ],
  (ethBalanceR, currencyR, ethRatesR) => {
    const transform = (value, rates, toCurrency) => {
      return Exchange.convertCoinToFiat({ coin: 'ETH', currency: toCurrency, rates, value })
    }

    return lift(transform)(ethBalanceR, ethRatesR, currencyR)
  }
)

export const getXlmBalanceInfo = createDeepEqualSelector(
  [
    getXlmBalance,
    selectors.core.settings.getCurrency,
    (state: RootState) => selectors.core.data.coins.getRates('XLM', state)
  ],
  (xlmBalanceR, currencyR, xlmRatesR) => {
    const transform = (value, rates, toCurrency) =>
      Exchange.convertCoinToFiat({ coin: 'XLM', currency: toCurrency, rates, value })
    return lift(transform)(xlmBalanceR, xlmRatesR, currencyR)
  }
)

export const getErc20BalancesInfo = createDeepEqualSelector(
  [selectors.core.settings.getCurrency, (state) => state],
  (currencyR, state) => {
    const transform = (currency) => {
      return selectors.core.data.eth.getErc20Coins().map((coin) => {
        const transform2 = (balance, rates) => {
          return Exchange.convertCoinToFiat({ coin, currency, rates, value: balance })
        }
        // TODO: erc20 phase 2, key off hash not symbol
        const balanceR = getErc20Balance(coin)(state)
        // @ts-ignore
        const ratesR = selectors.core.data.coins.getRates(coin, state)
        return ratesR ? lift(transform2)(balanceR, ratesR) : Remote.of('0')
      })
    }

    return lift(transform)(currencyR)
  }
)

export const getCoinsBalanceInfo = createDeepEqualSelector(
  [selectors.core.data.coins.getCoins, selectors.core.settings.getCurrency, (state) => state],
  (coins, currencyR, state) => {
    const transform = (currency) => {
      return coins.map((coin) => {
        const transform2 = (rates, balance) => {
          return Exchange.convertCoinToFiat({ coin, currency, rates, value: balance })
        }

        const balanceR = getCoinCustodialBalance(coin)(state)
        const ratesR = selectors.core.data.coins.getRates(coin, state)
        return ratesR ? lift(transform2)(ratesR, balanceR) : Remote.of('0')
      })
    }

    return lift(transform)(currencyR)
  }
)

export const getFiatBalanceInfo = createDeepEqualSelector(
  [
    (state) => selectors.core.data.coins.getRates('BTC', state),
    selectors.core.settings.getCurrency,
    selectors.components.simpleBuy.getSBBalances
  ],
  (btcRatesR, currencyR, sbBalancesR) => {
    const transform = (rates, currency, sbBalances: ExtractSuccess<typeof sbBalancesR>) => {
      const keys = Object.keys(WalletFiatEnum).filter(
        (value) => typeof WalletFiatEnum[value] === 'number'
      )

      // @ts-ignore
      const balances = keys.map((value: WalletFiatType) => {
        const standard = convertBaseToStandard(
          'FIAT',
          // @ts-ignore
          sbBalances[value]?.available || '0'
        )

        if (value === currency) return Number(standard)

        return Exchange.convertFiatToFiat({
          fromCurrency: value,
          rates,
          toCurrency: currency,
          value: standard
        })
      })

      return balances.reduce(add, 0)
    }

    return lift(transform)(btcRatesR, currencyR, sbBalancesR)
  }
)

export const getBalanceSelector = (coin: string) => {
  switch (coin) {
    case 'BCH':
      return getBchBalance
    case 'BTC':
      return getBtcBalance
    case 'ETH':
      return getEthBalance
    case 'XLM':
      return getXlmBalance
    case 'EUR':
    case 'GBP':
    case 'USD':
      return getFiatBalance(coin)
    default:
      switch (true) {
        case selectors.core.data.coins.getCoins().includes(coin):
          return getCoinCustodialBalance(coin)
        default:
          return getErc20Balance(coin)
      }
  }
}

export const getAllCoinsBalancesSelector = (state) => {
  return Object.keys(window.coins).reduce(
    (acc, curr) => {
      if (window.coins[curr].coinfig.type.erc20Address) {
        return {
          ...acc,
          [curr]: getErc20Balance(curr)(state).getOrElse(new BigNumber(0)).valueOf()
        }
      }
      if (selectors.core.data.coins.getCoins().includes(curr)) {
        return {
          ...acc,
          [curr]: getCoinCustodialBalance(curr)(state).getOrElse(new BigNumber(0)).valueOf()
        }
      }
      return { ...acc }
    },
    {
      BCH: new BigNumber(getBchBalance(state).getOrElse(0)).valueOf(),
      BTC: new BigNumber(getBtcBalance(state).getOrElse(0)).valueOf(),
      ETH: getEthBalance(state).getOrElse(new BigNumber(0)).valueOf(),
      XLM: getXlmBalance(state).getOrElse(new BigNumber(0)).valueOf()
    }
  )
}

export const getCoinsSortedByBalance = createDeepEqualSelector(
  [
    selectors.custodial.getRecentSwapTxs,
    selectors.components.utils.getCoinsWithBalanceOrMethod,
    getAllCoinsBalancesSelector,
    (state: RootState) => state
  ],
  (recentSwapTxsR, coinsR, balances, state: RootState) => {
    const transform = (coins: ExtractSuccess<typeof coinsR>) => {
      const coinSort = (a?: CoinfigType, b?: CoinfigType) => {
        if (!a || !b) return -1
        if (window.coins[a.symbol].coinfig.type.name === 'FIAT') return -1
        if (window.coins[b.symbol].coinfig.type.name === 'FIAT') return -1

        const coinA = a.symbol
        const coinB = b.symbol
        // doesnt really matter
        const currency = 'USD'

        const defaultRate = { price: 1 }

        const ratesA = selectors.core.data.misc
          .getRatesSelector(coinA, state)
          .getOrElse(defaultRate as RatesType)
        const ratesB = selectors.core.data.misc
          .getRatesSelector(coinB, state)
          .getOrElse(defaultRate as RatesType)

        const coinAFiat = Exchange.convertCoinToFiat({
          coin: coinA,
          currency,
          rates: ratesA,
          value: balances[coinA]
        })
        const coinBFiat = Exchange.convertCoinToFiat({
          coin: coinB,
          currency,
          rates: ratesB,
          value: balances[coinB]
        })

        return Number(coinAFiat) > Number(coinBFiat) ? -1 : 1
      }

      // returns all fiats that user is currently eligible for
      // @ts-ignore
      const fiatList = reject(
        not,
        map((coin) => {
          if (coin.coinCode in WalletFiatEnum && coin.method === true) {
            return coin.coinfig
          }
        }, coins)
      )

      // returns all coins with balances as a list
      const cryptoList = map(
        (coin) => coins.find((c) => c.coinfig.symbol === coin),
        reject(
          not,
          map((x) => last(x) !== '0' && head(x), toPairs(balances))
        )
      ).map((coin) => coin?.coinfig)

      // list of fiats eligible and then coins with balances as single list
      const coinsWithBalance = [...fiatList, ...cryptoList]
      const coinsInRecentSwaps = [
        ...new Set(
          recentSwapTxsR.getOrElse([] as SwapOrderType[]).map((tx) => getOutputFromPair(tx.pair))
        )
      ]
      const coinsWithoutBalanceToTrack = coinsInRecentSwaps
        .filter((coin) => !coinsWithBalance.find((coinfig) => coinfig?.symbol === coin))
        .filter((coin) => window.coins[coin])
        .map((coin) => window.coins[coin].coinfig)

      // list of coins with balance and then coins w/ no balance but swaps
      return [...coinsWithBalance, ...coinsWithoutBalanceToTrack].sort(coinSort) as CoinfigType[]
    }

    return lift(transform)(coinsR)
  }
)
