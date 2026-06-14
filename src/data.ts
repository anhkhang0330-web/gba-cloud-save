import { Pokemon } from "./types";

export interface GbaRomInfo {
  id: string;
  name: string;
  gameTitle: string;
  size: string;
  url: string;
  description: string;
}

// Built-in ROM list is empty as trials are removed
export const BUILTIN_ROMS: GbaRomInfo[] = [];

export interface PlayerAvatar {
  id: string;
  name: string;
  imageUrl: string;
}

export const TRAINER_AVATARS: PlayerAvatar[] = [
  { id: "red", name: "Red (Kanto)", imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/red.png" },
  { id: "brendan", name: "Brendan (Hoenn)", imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/emerald.png" },
  { id: "blue", name: "Blue (Gary)", imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/blue.png" },
  { id: "may", name: "May (Haruka)", imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/may.png" },
  { id: "leaf", name: "Leaf (Kanto)", imageUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/leaf.png" }
];

export const POKEMON_PRESETS: Pokemon[] = [
  {
    name: "Charizard (Lizardon)",
    level: 85,
    species: "Lửa / Bay",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png",
    hp: 268,
    maxHp: 268,
    moves: ["Flamethrower", "Dragon Claw", "Air Slash", "Earthquake"],
    stats: { hp: 268, attack: 180, defense: 172, spAtk: 220, spDef: 175, speed: 210 }
  },
  {
    name: "Venusaur (Fushigibana)",
    level: 85,
    species: "Cỏ / Độc",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/3.png",
    hp: 272,
    maxHp: 272,
    moves: ["Giga Drain", "Sludge Bomb", "Sleep Powder", "Earthquake"],
    stats: { hp: 272, attack: 176, defense: 183, spAtk: 210, spDef: 210, speed: 170 }
  },
  {
    name: "Blastoise (Kamex)",
    level: 85,
    species: "Nước",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/9.png",
    hp: 275,
    maxHp: 275,
    moves: ["Surf", "Hydro Pump", "Ice Beam", "Bite"],
    stats: { hp: 275, attack: 178, defense: 222, spAtk: 185, spDef: 228, speed: 165 }
  },
  {
    name: "Pikachu (Thần sấm)",
    level: 88,
    species: "Điện",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
    hp: 222,
    maxHp: 222,
    moves: ["Thunderbolt", "Iron Tail", "Volt Tackle", "Thunder Wave"],
    stats: { hp: 222, attack: 165, defense: 120, spAtk: 195, spDef: 135, speed: 235 }
  },
  {
    name: "Rayquaza (Rồng thần)",
    level: 100,
    species: "Rồng / Bay",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/384.png",
    hp: 351,
    maxHp: 351,
    moves: ["Outrage", "Dragon Claw", "Extreme Speed", "Flamethrower"],
    stats: { hp: 351, attack: 336, defense: 216, spAtk: 336, spDef: 216, speed: 226 }
  },
  {
    name: "Mewtwo (Mew-hai)",
    level: 100,
    species: "Tâm Linh",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png",
    hp: 353,
    maxHp: 353,
    moves: ["Psychic", "Ice Beam", "Thunderbolt", "Recover"],
    stats: { hp: 353, attack: 256, defense: 216, spAtk: 344, spDef: 216, speed: 296 }
  },
  {
    name: "Gengar (Ma quỷ)",
    level: 85,
    species: "Ma / Độc",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/94.png",
    hp: 238,
    maxHp: 238,
    moves: ["Shadow Ball", "Sludge Bomb", "Psychic", "Hypnosis"],
    stats: { hp: 238, attack: 145, defense: 135, spAtk: 247, spDef: 167, speed: 228 }
  },
  {
    name: "Gardevoir (Nữ thần)",
    level: 85,
    species: "Tâm Linh",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/282.png",
    hp: 248,
    maxHp: 248,
    moves: ["Psychic", "Thunderbolt", "Calm Mind", "Hypnosis"],
    stats: { hp: 248, attack: 139, defense: 139, spAtk: 236, spDef: 222, speed: 173 }
  },
  {
    name: "Metagross (Thép giáp)",
    level: 88,
    species: "Thép / Tâm Linh",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/376.png",
    hp: 288,
    maxHp: 288,
    moves: ["Meteor Mash", "Earthquake", "Psychic", "Rock Slide"],
    stats: { hp: 288, attack: 286, defense: 276, spAtk: 202, spDef: 198, speed: 158 }
  },
  {
    name: "Salamence (Bạo long)",
    level: 88,
    species: "Rồng / Bay",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/373.png",
    hp: 298,
    maxHp: 298,
    moves: ["Dragon Claw", "Flamethrower", "Fly", "Earthquake"],
    stats: { hp: 298, attack: 276, defense: 176, spAtk: 242, spDef: 176, speed: 216 }
  },
  {
    name: "Snorlax (Ham ăn)",
    level: 85,
    species: "Thường",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png",
    hp: 382,
    maxHp: 382,
    moves: ["Body Slam", "Earthquake", "Rest", "Hyper Beam"],
    stats: { hp: 382, attack: 221, defense: 145, spAtk: 145, spDef: 221, speed: 105 }
  },
  {
    name: "Lucario (Chiến binh)",
    level: 85,
    species: "Đấm / Thép",
    spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/448.png",
    hp: 252,
    maxHp: 252,
    moves: ["Aura Sphere", "Close Combat", "Extreme Speed", "Dragon Pulse"],
    stats: { hp: 252, attack: 221, defense: 153, spAtk: 230, spDef: 153, speed: 198 }
  }
];
