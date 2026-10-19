import type { ProposedGame } from './competition';
type Slot = {fieldId:string;fieldName:string;time:string};
export function moveProposal(games:ProposedGame[],index:number,target:Slot,slots:Slot[],earliest?:Record<string,string>,clubReservations?:{club:string;categoryId:string;time:string}[]):ProposedGame[];
