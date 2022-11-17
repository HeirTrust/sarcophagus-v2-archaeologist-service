import { Web3Interface } from "../../scripts/web3-interface";
import { unwrapSarcophagus } from "./unwrap";
import { scheduleUnwrap } from "../scheduler";
import { getGracePeriod, getSarcophagiIds, inMemoryStore, SarcophagusData, SarcophagusState } from "../onchain-data";
import { BigNumber } from "ethers";

// TODO -- once typechain defs are in the sarcophagus-org package,
// the types in this file and onchain-data can get updated
const curseIsActive = (sarcophagus: any, archaeologist: any): boolean => {
  return archaeologist.unencryptedShard === '0x' &&
    [SarcophagusState.Active, SarcophagusState.Resurrecting].includes(sarcophagus.state);
}

const endOfGracePeriod = (sarcophagus: any, gracePeriod: BigNumber): number => {
  return sarcophagus.resurrectionTime.toNumber() + gracePeriod.toNumber();
}

export async function fetchSarcophagiAndScheduleUnwraps(
  web3Interface: Web3Interface
): Promise<SarcophagusData[]> {
  inMemoryStore.gracePeriod = inMemoryStore.gracePeriod || await getGracePeriod(web3Interface);

  const sarcophagi: SarcophagusData[] = [];
  const sarcoIds = await getSarcophagiIds(web3Interface);

  sarcoIds.map(async sarcoId => {
    const sarcophagus = await web3Interface.viewStateFacet.getSarcophagus(sarcoId);
    const archaeologist = await web3Interface.viewStateFacet.getSarcophagusArchaeologist(
      sarcoId,
      web3Interface.ethWallet.address
    );

    if (curseIsActive(sarcophagus, archaeologist)) {
      const nowSeconds = new Date().getTime() / 1000;

      const tooLateToUnwrap = nowSeconds > endOfGracePeriod(sarcophagus, inMemoryStore.gracePeriod!);
      if (tooLateToUnwrap) {
        return;
      }

      const resurrectionTimeMs = new Date(sarcophagus.resurrectionTime.toNumber() * 1000);

      // If past the resurrection time, start unwrapping now
      // otherwise, schedule rewrap for the resurrection time
      if (nowSeconds > sarcophagus.resurrectionTime.toNumber()) {
        await unwrapSarcophagus(web3Interface, sarcoId);
      } else {
        scheduleUnwrap(web3Interface, sarcoId, resurrectionTimeMs);
      }

      sarcophagi.push({
        id: sarcoId,
        resurrectionTime: resurrectionTimeMs,
      });
    }
  });

  return sarcophagi;
}