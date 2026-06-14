export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export interface Pokemon {
  name: string;
  level: number;
  species: string; // e.g., "FireRed", "Water", "Grass"
  spriteUrl: string; // fallback icon or retro image
  hp: number;
  maxHp: number;
  moves: string[];
  stats: PokemonStats;
}

export interface Trainer {
  id: string;
  username: string;
  avatar: string; // GBA trainer sprite ID
  team: Pokemon[];
  status: "idle" | "battling" | "trading";
}

export interface LobbyUpdatePayload {
  players: Trainer[];
}

export interface BattleUpdatePayload {
  id: string;
  selfTeam: Pokemon[];
  selfActiveIdx: number;
  selfCurrentHp: number[];
  selfName: string;
  oppTeam: Pokemon[];
  oppActiveIdx: number;
  oppCurrentHp: number[];
  oppName: string;
  log: string[];
  pendingAction: boolean;
}

export interface BattleEndedPayload {
  battle: BattleUpdatePayload;
  winnerId: string;
}

export interface TradeUpdatePayload {
  id: string;
  p1: { id: string; selectedPokemonIdx: number | null; confirmed: boolean };
  p2: { id: string; selectedPokemonIdx: number | null; confirmed: boolean };
}

export interface TradeStartedPayload {
  tradeId: string;
  otherUser: {
    id: string;
    username: string;
    team: Pokemon[];
  };
}

export interface TradeCompletePayload {
  team: Pokemon[];
  receivedPokemon: Pokemon;
  sentPokemon: Pokemon;
}
