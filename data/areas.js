// Areas by map ID from the save. Names use the official English names; the German mode swaps them via data/names.js.
// step: route step the area belongs to. Entering the area means that step was reached.
// chests: contents per meowdb (https://meowdb.com/db/final-fantasy-resonance/areas), Chapter 1 only so far.
// shards: Tablet Shard locations in this area. In these areas every loose item spot (treasure entry with ID -1) is a Tablet Shard.
// note: extra hint per language. Unknown IDs show as "Area <ID>"; add names here once known.
const AREAS={
  1000:{name:"World Map",step:null},
  3000:{name:"Earth Shrine",step:"n-earth",chests:["Phoenix Down ×1","Nodachi ×1","Flame Scroll I ×2","Potion ×3","Bulletproof Vest ×1","400 Gil"]},
  3001:{name:"Earth Shrine",note:{en:"depths",de:"Tiefe"},step:"n-earth",chests:["Potion ×1","Ether ×1"]},
  2000:{name:"Town of Mitra",step:"n-mitra",chests:["Ether ×1","Phoenix Down ×1","Tent ×1","Phoenix Down ×3","Ether ×1"]},
  2014:{name:"Grandshelt Castle",step:"n-grandshelt"},
  3020:{name:"Grandshelt Castle",note:{en:"during the fire",de:"während des Brands"},step:"n-grandshelt",chests:["Flame Scroll I ×3","Antidote Herb ×4","Flame Scroll I ×2","Phoenix Down ×1","Phoenix Down ×2","Black Garb ×1","Mist Turbo Ether ×1","Mist Hi-Potion ×2"]},
  2015:{name:"Commercial District",step:"n-grandshelt",shards:{en:["#1 by the crates west of the stalls"],de:["#1 bei den Kisten westlich der Stände"]},chests:["300 Gil","300 Gil","Healing Spring ×1"]},
  2020:{name:"Village of Kol",step:"n-desert",shards:{en:["#2 left of the SW pond"],de:["#2 links vom SW-Teich"]},chests:["Tent ×1","Antidote Herb ×3"]},
  2030:{name:"Grandport Harbor",step:"n-grandport1",shards:{en:["#7 barrels on the pier","#8 by the tree west of the weapon shop"],de:["#7 Fässer am Pier","#8 am Baum westlich vom Waffenladen"]},chests:["Smoke Bomb ×2","Lightning Scroll I ×2"]},
  2040:{name:"Town of Felicitas",step:"n-felicitas",shards:{en:["#3 east past the bridge","#4 hidden path in the west behind a wall"],de:["#3 östlich hinter der Brücke","#4 versteckter Weg im Westen hinter einer Mauer"]},chests:["Tent ×1","Smoke Bomb ×2","Unicorn Horn ×2","Ice Scroll I ×2"]},
  3040:{name:"Kolobos Ruins",step:"n-kolobos",shards:{en:["#5 behind grey cylinders","#6 behind a fallen pillar"],de:["#5 hinter grauen Zylindern","#6 hinter umgestürzter Säule"]},chests:["Prickly Straitjacket ×1","Knife of Poison ×2","Antidote Herb ×3","Ether ×2"]},
  3031:{name:"Cavern of Swords",step:"n-grandport2",shards:{en:["#9 behind a stalagmite at the end of the cave"],de:["#9 hinter Stalagmit am Höhlenende"]}},
  3030:{name:"Siren's Tower",step:"n-siren",shards:{en:["#10 ledge in the tower","#11 ledge in the tower","#12 ledge in the tower"],de:["#10 Vorsprung im Turm","#11 Vorsprung im Turm","#12 Vorsprung im Turm"]},chests:["Echo Herb ×2","Magicite Shard ×1","Sakura-Fubuki ×1","Monk's Prayer Beads ×1","Ether ×1","Ether ×2"]},
  2060:{name:"Dilmagia",step:"n-dilmagia",shards:{en:["#13 cordoned-off side area","#14 crates at the crossroads"],de:["#13 abgesperrter Seitenbereich","#14 Kisten an der Kreuzung"]}},
  2061:{name:"Dilmagia Shipyard",step:"n-dilmagia",shards:{en:["#15 Shipyard stairs","#16 Shipyard stairs"],de:["#15 Treppe der Shipyard","#16 Treppe der Shipyard"]}},
  3050:{name:"Mt. Thunderclap",step:null,shards:{en:["#17 hard path","#18 easy path","#19 behind rocks south of the Zidane shrine"],de:["#17 schwerer Pfad","#18 leichter Pfad","#19 hinter Felsen südlich vom Zidane-Schrein"]}},
  2050:{name:"Dwarven Forge",step:null,shards:{en:["#20 south of the SW bridge","#21 south of the Mom Bomb path"],de:["#20 südlich der SW-Brücke","#21 südlich vom Mom-Bomb-Pfad"]}},
  20000:{name:"Airship",note:{en:"also visited in the prologue",de:"auch im Prolog besucht"},step:null}
};

// Islands (lastIslandVisited in the save) → first route step there
const ISLAND_STEP={Dirnado:"n-dilmagia",Olderion:"n-oldsouth",Zoldaad:"n-zoldaadmap",Mysidia:"n-mysidia",Gronoa:"n-gronoa",Pharm:"n-pharm"};

// Character joins (character ID) → route step
const JOIN_STEP={1004:"n-dilmagia",1005:"n-cave",1007:"n-rebel",1008:"n-mysidia"};

// Tablet-Shard entries in the route → areas they cover
const SHARD_ENTRY={"t-1":[2015,2020],"t-2":[2040,3040],"t-3":[2030,3031],"t-4":[3030],"t-5":[2060,2061],"t-6":[3050]};
