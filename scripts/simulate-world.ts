import { simulateWorld } from "@/world/simulation";

console.log(JSON.stringify(simulateWorld({ days: 30 }), null, 2));
