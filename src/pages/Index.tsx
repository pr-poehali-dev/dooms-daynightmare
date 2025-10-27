import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';

type GameMode = 'menu' | 'playing' | 'inventory' | 'creative' | 'settings';
type BlockType = 'air' | 'grass' | 'dirt' | 'stone' | 'wood' | 'planks' | 'leaves' | 'water' | 'sand' | 'cobblestone' | 'glass' | 'brick' | 'tnt';

interface Block {
  type: BlockType;
}

interface TNTEntity {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  fuse: number;
}

interface Player {
  x: number;
  y: number;
  z: number;
  velY: number;
  angleX: number;
  angleY: number;
  selectedSlot: number;
  onGround: boolean;
  mode: 'survival' | 'creative';
}

interface InventorySlot {
  type: BlockType | null;
  count: number;
}

interface GraphicsSettings {
  renderDistance: number;
  fov: number;
  rayDensity: number;
  shadows: boolean;
}

const BLOCK_COLORS: Record<BlockType, string> = {
  air: 'transparent',
  grass: '#6B8E23',
  dirt: '#8B4513',
  stone: '#808080',
  wood: '#654321',
  planks: '#DEB887',
  leaves: '#228B22',
  water: '#4169E1',
  sand: '#F4A460',
  cobblestone: '#6B6B6B',
  glass: '#87CEEB',
  brick: '#B22222',
  tnt: '#FF0000',
};

const ALL_BLOCKS: BlockType[] = ['grass', 'dirt', 'stone', 'wood', 'planks', 'leaves', 'sand', 'cobblestone', 'glass', 'brick', 'water', 'tnt'];

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;

const generateTerrain = (chunkX: number, chunkZ: number): Block[][][] => {
  const chunk: Block[][][] = Array(CHUNK_SIZE).fill(null).map(() =>
    Array(WORLD_HEIGHT).fill(null).map(() =>
      Array(CHUNK_SIZE).fill(null).map(() => ({ type: 'air' as BlockType }))
    )
  );

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldX = chunkX * CHUNK_SIZE + x;
      const worldZ = chunkZ * CHUNK_SIZE + z;
      
      const baseHeight = 32;
      const noise1 = Math.sin(worldX * 0.05) * Math.cos(worldZ * 0.05) * 3;
      const noise2 = Math.sin(worldX * 0.02) * Math.cos(worldZ * 0.02) * 8;
      const height = Math.floor(baseHeight + noise1 + noise2);
      
      const biome = Math.sin(worldX * 0.01) + Math.cos(worldZ * 0.01);
      
      for (let y = 0; y < height; y++) {
        if (y === 0) {
          chunk[x][y][z] = { type: 'stone' };
        } else if (y < height - 4) {
          chunk[x][y][z] = { type: 'stone' };
        } else if (y < height - 1) {
          chunk[x][y][z] = { type: 'dirt' };
        } else {
          if (biome > 0.5) {
            chunk[x][y][z] = { type: 'sand' };
          } else {
            chunk[x][y][z] = { type: 'grass' };
          }
        }
      }
      
      if (biome <= 0.5 && Math.random() < 0.015 && height < WORLD_HEIGHT - 6) {
        for (let y = height; y < height + 5; y++) {
          chunk[x][y][z] = { type: 'wood' };
        }
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 0; dy < 3; dy++) {
              const nx = x + dx;
              const nz = z + dz;
              const ny = height + 4 + dy;
              if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < WORLD_HEIGHT) {
                if (Math.abs(dx) + Math.abs(dz) <= 2) {
                  chunk[nx][ny][nz] = { type: 'leaves' };
                }
              }
            }
          }
        }
      }
      
      if (biome > 0.5 && height > 30 && height < 34) {
        chunk[x][height][z] = { type: 'water' };
        chunk[x][height + 1][z] = { type: 'water' };
      }
    }
  }

  return chunk;
};

export default function Index() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [player, setPlayer] = useState<Player>({
    x: 8,
    y: 45,
    z: 8,
    velY: 0,
    angleX: 0,
    angleY: 0,
    selectedSlot: 0,
    onGround: false,
    mode: 'survival',
  });
  const [inventory, setInventory] = useState<InventorySlot[]>(
    Array(36).fill(null).map(() => ({ type: null, count: 0 }))
  );
  const [tntEntities, setTntEntities] = useState<TNTEntity[]>([]);
  const [graphics, setGraphics] = useState<GraphicsSettings>({
    renderDistance: 10,
    fov: 75,
    rayDensity: 2,
    shadows: true,
  });
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [lookJoystick, setLookJoystick] = useState({ x: 0, y: 0 });
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const worldRef = useRef<Map<string, Block[][][]>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const getChunkKey = (chunkX: number, chunkZ: number) => `${chunkX},${chunkZ}`;

  const getBlock = useCallback((x: number, y: number, z: number): Block => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const key = getChunkKey(chunkX, chunkZ);
    
    if (!worldRef.current.has(key)) {
      worldRef.current.set(key, generateTerrain(chunkX, chunkZ));
    }
    
    const chunk = worldRef.current.get(key)!;
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    if (y < 0 || y >= WORLD_HEIGHT) return { type: 'air' };
    
    return chunk[localX][y][localZ];
  }, []);

  const setBlock = useCallback((x: number, y: number, z: number, block: Block) => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const key = getChunkKey(chunkX, chunkZ);
    
    if (!worldRef.current.has(key)) {
      worldRef.current.set(key, generateTerrain(chunkX, chunkZ));
    }
    
    const chunk = worldRef.current.get(key)!;
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    if (y >= 0 && y < WORLD_HEIGHT) {
      chunk[localX][y][localZ] = block;
    }
  }, []);

  const igniteTNT = useCallback((x: number, y: number, z: number) => {
    setTntEntities(prev => [...prev, {
      x: x + 0.5,
      y: y + 0.5,
      z: z + 0.5,
      velX: (Math.random() - 0.5) * 0.02,
      velY: 0.2,
      velZ: (Math.random() - 0.5) * 0.02,
      fuse: 80,
    }]);
    setBlock(x, y, z, { type: 'air' });
  }, [setBlock]);

  const explodeTNT = useCallback((x: number, y: number, z: number) => {
    const radius = 4;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist <= radius) {
            const bx = Math.floor(x + dx);
            const by = Math.floor(y + dy);
            const bz = Math.floor(z + dz);
            const block = getBlock(bx, by, bz);
            
            if (block.type === 'tnt') {
              igniteTNT(bx, by, bz);
            } else if (block.type !== 'air' && Math.random() > dist / radius * 0.5) {
              setBlock(bx, by, bz, { type: 'air' });
            }
          }
        }
      }
    }
  }, [getBlock, setBlock, igniteTNT]);

  const startGame = (mode: 'survival' | 'creative') => {
    worldRef.current.clear();
    setTntEntities([]);
    const startInventory = Array(36).fill(null).map(() => ({ type: null, count: 0 }));
    
    if (mode === 'creative') {
      ALL_BLOCKS.forEach((blockType, index) => {
        if (index < 36) {
          startInventory[index] = { type: blockType, count: 64 };
        }
      });
    }
    
    setInventory(startInventory);
    setPlayer({
      x: 8,
      y: 45,
      z: 8,
      velY: 0,
      angleX: 0,
      angleY: 0,
      selectedSlot: 0,
      onGround: false,
      mode,
    });
    setGameMode('playing');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameMode === 'playing') {
        setKeys(prev => new Set(prev).add(e.key.toLowerCase()));
        
        if (e.key === 'Escape') {
          setGameMode('menu');
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
        
        if (e.key === 'e' || e.key === 'E') {
          setGameMode('inventory');
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
        
        if (e.key === 'c' || e.key === 'C') {
          setGameMode('creative');
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
        
        if (e.key >= '1' && e.key <= '9') {
          setPlayer(prev => ({ ...prev, selectedSlot: parseInt(e.key) - 1 }));
        }
      } else if ((gameMode === 'inventory' || gameMode === 'creative' || gameMode === 'settings') && (e.key === 'Escape' || e.key === 'e' || e.key === 'E' || e.key === 'c' || e.key === 'C')) {
        setGameMode('playing');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(e.key.toLowerCase());
        return newKeys;
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (gameMode === 'playing' && !isMobile && isPointerLocked) {
        setPlayer(prev => ({
          ...prev,
          angleX: prev.angleX + e.movementX * 0.002,
          angleY: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.angleY - e.movementY * 0.002)),
        }));
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (gameMode === 'playing' && !isMobile) {
        if (!isPointerLocked && canvasRef.current) {
          canvasRef.current.requestPointerLock();
        } else {
          if (e.button === 0) {
            breakBlock();
          } else if (e.button === 2) {
            placeBlock();
          }
        }
      }
    };

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const handlePointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === canvasRef.current);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [gameMode, isMobile, isPointerLocked]);

  const raycast = useCallback((maxDist: number = 5): { x: number; y: number; z: number; face: number } | null => {
    const step = 0.1;
    const dirX = Math.cos(player.angleY) * Math.cos(player.angleX);
    const dirY = -Math.sin(player.angleY);
    const dirZ = Math.cos(player.angleY) * Math.sin(player.angleX);

    for (let i = 0; i < maxDist / step; i++) {
      const dist = i * step;
      const x = Math.floor(player.x + dirX * dist);
      const y = Math.floor(player.y + dirY * dist);
      const z = Math.floor(player.z + dirZ * dist);

      const block = getBlock(x, y, z);
      if (block.type !== 'air' && block.type !== 'water') {
        const prevX = Math.floor(player.x + dirX * (dist - step));
        const prevY = Math.floor(player.y + dirY * (dist - step));
        const prevZ = Math.floor(player.z + dirZ * (dist - step));
        
        let face = 0;
        if (prevX !== x) face = dirX > 0 ? 1 : 2;
        else if (prevY !== y) face = dirY > 0 ? 3 : 4;
        else if (prevZ !== z) face = dirZ > 0 ? 5 : 6;
        
        return { x, y, z, face };
      }
    }
    return null;
  }, [player, getBlock]);

  const breakBlock = useCallback(() => {
    const hit = raycast();
    if (hit) {
      const block = getBlock(hit.x, hit.y, hit.z);
      
      if (block.type === 'tnt') {
        igniteTNT(hit.x, hit.y, hit.z);
        return;
      }
      
      setBlock(hit.x, hit.y, hit.z, { type: 'air' });
      
      if (player.mode === 'survival') {
        const slot = inventory.find(s => s.type === block.type && s.count < 64);
        if (slot) {
          slot.count++;
        } else {
          const emptySlot = inventory.find(s => s.type === null);
          if (emptySlot) {
            emptySlot.type = block.type;
            emptySlot.count = 1;
          }
        }
        setInventory([...inventory]);
      }
    }
  }, [raycast, getBlock, setBlock, inventory, player.mode, igniteTNT]);

  const placeBlock = useCallback(() => {
    const hit = raycast();
    if (hit && inventory[player.selectedSlot].type && inventory[player.selectedSlot].count > 0) {
      const faceOffsets = [
        [0, 0, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      
      const offset = faceOffsets[hit.face];
      const newX = hit.x + offset[0];
      const newY = hit.y + offset[1];
      const newZ = hit.z + offset[2];
      
      const playerBox = {
        minX: Math.floor(player.x - 0.3),
        maxX: Math.floor(player.x + 0.3),
        minY: Math.floor(player.y - 1.8),
        maxY: Math.floor(player.y + 0.2),
        minZ: Math.floor(player.z - 0.3),
        maxZ: Math.floor(player.z + 0.3),
      };
      
      if (newX < playerBox.minX || newX > playerBox.maxX ||
          newY < playerBox.minY || newY > playerBox.maxY ||
          newZ < playerBox.minZ || newZ > playerBox.maxZ) {
        setBlock(newX, newY, newZ, { type: inventory[player.selectedSlot].type! });
        
        if (player.mode === 'survival') {
          inventory[player.selectedSlot].count--;
          if (inventory[player.selectedSlot].count === 0) {
            inventory[player.selectedSlot].type = null;
          }
          setInventory([...inventory]);
        }
      }
    }
  }, [raycast, setBlock, inventory, player]);

  const gameLoop = useCallback(() => {
    if (gameMode !== 'playing') return;

    setPlayer(prev => {
      let newX = prev.x;
      let newY = prev.y;
      let newZ = prev.z;
      let newVelY = prev.velY;
      let newAngleX = prev.angleX;
      let newAngleY = prev.angleY;

      if (isMobile) {
        newAngleX += lookJoystick.x * 0.03;
        newAngleY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newAngleY - lookJoystick.y * 0.03));
        
        const moveSpeed = 0.1;
        newX += Math.cos(newAngleX) * moveSpeed * joystickPos.y;
        newZ += Math.sin(newAngleX) * moveSpeed * joystickPos.y;
      } else {
        const baseSpeed = 0.1;
        const moveSpeed = keys.has('shift') ? baseSpeed * 1.5 : baseSpeed;
        
        if (keys.has('w')) {
          newX += Math.cos(prev.angleX) * moveSpeed;
          newZ += Math.sin(prev.angleX) * moveSpeed;
        }
        if (keys.has('s')) {
          newX -= Math.cos(prev.angleX) * moveSpeed;
          newZ -= Math.sin(prev.angleX) * moveSpeed;
        }
        if (keys.has('a')) {
          newX += Math.cos(prev.angleX - Math.PI / 2) * moveSpeed;
          newZ += Math.sin(prev.angleX - Math.PI / 2) * moveSpeed;
        }
        if (keys.has('d')) {
          newX += Math.cos(prev.angleX + Math.PI / 2) * moveSpeed;
          newZ += Math.sin(prev.angleX + Math.PI / 2) * moveSpeed;
        }
      }

      const checkCollision = (x: number, y: number, z: number): boolean => {
        const checks = [
          [x - 0.3, y - 1.8, z - 0.3],
          [x + 0.3, y - 1.8, z - 0.3],
          [x - 0.3, y - 1.8, z + 0.3],
          [x + 0.3, y - 1.8, z + 0.3],
          [x - 0.3, y - 0.9, z - 0.3],
          [x + 0.3, y - 0.9, z - 0.3],
          [x - 0.3, y - 0.9, z + 0.3],
          [x + 0.3, y - 0.9, z + 0.3],
          [x - 0.3, y, z - 0.3],
          [x + 0.3, y, z - 0.3],
          [x - 0.3, y, z + 0.3],
          [x + 0.3, y, z + 0.3],
        ];
        
        for (const [cx, cy, cz] of checks) {
          const block = getBlock(Math.floor(cx), Math.floor(cy), Math.floor(cz));
          if (block.type !== 'air' && block.type !== 'water') return true;
        }
        return false;
      };

      if (!checkCollision(newX, newY, prev.z)) {
        newX = newX;
      } else {
        newX = prev.x;
      }

      if (!checkCollision(prev.x, newY, newZ)) {
        newZ = newZ;
      } else {
        newZ = prev.z;
      }

      if (prev.mode === 'creative') {
        if (keys.has(' ')) {
          newY += 0.1;
        }
        if (keys.has('shift')) {
          newY -= 0.1;
        }
        newVelY = 0;
      } else {
        newVelY -= 0.02;
        newY += newVelY;

        if (checkCollision(newX, newY, newZ)) {
          if (newVelY < 0) {
            newY = Math.floor(newY) + 1;
            newVelY = 0;
            
            if (keys.has(' ') && !isMobile) {
              newVelY = 0.15;
            }
          } else {
            newY = Math.ceil(newY);
            newVelY = 0;
          }
        }
      }

      return { ...prev, x: newX, y: newY, z: newZ, velY: newVelY, angleX: newAngleX, angleY: newAngleY };
    });

    setTntEntities(prev => {
      const updated: TNTEntity[] = [];
      prev.forEach(tnt => {
        tnt.fuse--;
        if (tnt.fuse <= 0) {
          explodeTNT(tnt.x, tnt.y, tnt.z);
        } else {
          tnt.velY -= 0.02;
          tnt.x += tnt.velX;
          tnt.y += tnt.velY;
          tnt.z += tnt.velZ;
          
          const block = getBlock(Math.floor(tnt.x), Math.floor(tnt.y - 0.5), Math.floor(tnt.z));
          if (block.type !== 'air') {
            tnt.velY = 0;
            tnt.velX *= 0.8;
            tnt.velZ *= 0.8;
            tnt.y = Math.floor(tnt.y) + 0.5;
          }
          
          updated.push(tnt);
        }
      });
      return updated;
    });

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameMode, keys, isMobile, joystickPos, lookJoystick, getBlock, explodeTNT]);

  useEffect(() => {
    if (gameMode === 'playing') {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameMode, gameLoop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameMode !== 'playing') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const FOV = (graphics.fov * Math.PI) / 180;
    const density = graphics.rayDensity;
    const NUM_RAYS_H = isMobile ? 60 * density : 100 * density;
    const NUM_RAYS_V = isMobile ? 45 * density : 75 * density;

    for (let rayY = 0; rayY < NUM_RAYS_V; rayY++) {
      for (let rayX = 0; rayX < NUM_RAYS_H; rayX++) {
        const angleH = player.angleX - FOV / 2 + (rayX / NUM_RAYS_H) * FOV;
        const angleV = player.angleY - (FOV * 0.6) / 2 + (rayY / NUM_RAYS_V) * (FOV * 0.6);

        const dirX = Math.cos(angleV) * Math.cos(angleH);
        const dirY = -Math.sin(angleV);
        const dirZ = Math.cos(angleV) * Math.sin(angleH);

        const step = 0.1;
        let hitBlock: Block | null = null;
        let hitDist = 0;
        let hitFace = 0;

        for (let i = 0; i < graphics.renderDistance * 10; i++) {
          const dist = i * step;
          const x = Math.floor(player.x + dirX * dist);
          const y = Math.floor(player.y + dirY * dist);
          const z = Math.floor(player.z + dirZ * dist);

          const block = getBlock(x, y, z);
          if (block.type !== 'air' && block.type !== 'water') {
            hitBlock = block;
            hitDist = dist;
            
            const prevX = Math.floor(player.x + dirX * (dist - step));
            const prevY = Math.floor(player.y + dirY * (dist - step));
            const prevZ = Math.floor(player.z + dirZ * (dist - step));
            
            if (prevY !== y) hitFace = dirY > 0 ? 1 : 0;
            else if (prevX !== x) hitFace = 2;
            else if (prevZ !== z) hitFace = 3;
            
            break;
          }
        }

        if (hitBlock) {
          const brightness = Math.max(0.3, 1 - hitDist / graphics.renderDistance);
          const faceBrightness = graphics.shadows ? (hitFace === 0 ? 1 : hitFace === 1 ? 0.6 : 0.8) : 0.9;
          
          let color = BLOCK_COLORS[hitBlock.type];
          if (hitBlock.type === 'tnt') {
            const stripe = Math.floor((rayX + rayY) / 4) % 2 === 0;
            color = stripe ? '#FF0000' : '#FFFFFF';
          }
          
          const rgb = parseInt(color.slice(1), 16);
          const r = ((rgb >> 16) & 255) * brightness * faceBrightness;
          const g = ((rgb >> 8) & 255) * brightness * faceBrightness;
          const b = (rgb & 255) * brightness * faceBrightness;

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(
            (rayX / NUM_RAYS_H) * canvas.width,
            (rayY / NUM_RAYS_V) * canvas.height,
            Math.ceil(canvas.width / NUM_RAYS_H) + 1,
            Math.ceil(canvas.height / NUM_RAYS_V) + 1
          );
        }
      }
    }

    tntEntities.forEach(tnt => {
      const dx = tnt.x - player.x;
      const dy = tnt.y - player.y;
      const dz = tnt.z - player.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (dist < graphics.renderDistance) {
        const angleToTnt = Math.atan2(dz, dx) - player.angleX;
        const angleToTntV = Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz)) - player.angleY;
        
        const screenX = canvas.width / 2 + (angleToTnt / FOV) * canvas.width;
        const screenY = canvas.height / 2 + (angleToTntV / (FOV * 0.6)) * canvas.height;
        
        const size = Math.max(20, 200 / dist);
        const flash = tnt.fuse % 20 < 10;
        
        ctx.fillStyle = flash ? '#FFFFFF' : '#FF0000';
        ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
        
        ctx.fillStyle = '#000000';
        ctx.font = `${size / 2}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(tnt.fuse / 20).toString(), screenX, screenY + size / 4);
      }
    });

    const crosshairSize = 20;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - crosshairSize / 2, canvas.height / 2);
    ctx.lineTo(canvas.width / 2 + crosshairSize / 2, canvas.height / 2);
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - crosshairSize / 2);
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + crosshairSize / 2);
    ctx.stroke();

  }, [player, gameMode, getBlock, isMobile, graphics, tntEntities]);

  if (gameMode === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-700 via-green-800 to-green-900 p-4">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSJub25lIi8+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMzIiIHk9IjAiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNDgiIHk9IjE2IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIwIiB5PSIzMiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMzIiIHk9IjMyIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSIxNiIgeT0iNDgiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0iIzAwMCIvPjxyZWN0IHg9IjQ4IiB5PSI0OCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMDAwIi8+PC9zdmc+')]" />
        <Card className="p-10 max-w-lg w-full space-y-8 bg-card/95 backdrop-blur-sm shadow-2xl border-4 border-primary/20">
          <div className="text-center space-y-3">
            <h1 className="text-7xl font-bold text-primary drop-shadow-lg" style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>
              MINECRAFT
            </h1>
            <p className="text-xl text-muted-foreground font-semibold">Воксельный мир</p>
          </div>
          
          <div className="space-y-4">
            <Button onClick={() => startGame('survival')} className="w-full h-14 text-xl font-bold shadow-lg hover:shadow-xl transition-all">
              <Icon name="Sword" className="mr-3" size={24} />
              Режим выживания
            </Button>
            <Button onClick={() => startGame('creative')} className="w-full h-14 text-xl font-bold shadow-lg hover:shadow-xl transition-all" variant="secondary">
              <Icon name="Sparkles" className="mr-3" size={24} />
              Креативный режим
            </Button>
            <Button onClick={() => setGameMode('settings')} className="w-full h-14 text-xl font-bold shadow-lg hover:shadow-xl transition-all" variant="outline">
              <Icon name="Settings" className="mr-3" size={24} />
              Настройки графики
            </Button>
          </div>
          
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>Управление: WASD, Мышь, ЛКМ/ПКМ</p>
          </div>
        </Card>
      </div>
    );
  }

  if (gameMode === 'settings') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-700 to-slate-900 p-4">
        <Card className="p-8 max-w-2xl w-full space-y-6">
          <h2 className="text-4xl font-bold text-center mb-6">Настройки графики</h2>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-lg">Дальность прорисовки: {graphics.renderDistance} блоков</Label>
              </div>
              <Slider
                value={[graphics.renderDistance]}
                onValueChange={(val) => setGraphics(prev => ({ ...prev, renderDistance: val[0] }))}
                min={5}
                max={20}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">Чем больше — тем дальше видно, но медленнее</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-lg">Поле зрения (FOV): {graphics.fov}°</Label>
              </div>
              <Slider
                value={[graphics.fov]}
                onValueChange={(val) => setGraphics(prev => ({ ...prev, fov: val[0] }))}
                min={60}
                max={110}
                step={5}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">Стандарт: 75°, широкий обзор: 90°+</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-lg">Качество: {graphics.rayDensity === 1 ? 'Низкое' : graphics.rayDensity === 2 ? 'Среднее' : 'Высокое'}</Label>
              </div>
              <Slider
                value={[graphics.rayDensity]}
                onValueChange={(val) => setGraphics(prev => ({ ...prev, rayDensity: val[0] }))}
                min={1}
                max={3}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">Влияет на детализацию изображения</p>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="text-lg">Тени</Label>
                <p className="text-sm text-muted-foreground">Освещение граней блоков</p>
              </div>
              <Switch
                checked={graphics.shadows}
                onCheckedChange={(val) => setGraphics(prev => ({ ...prev, shadows: val }))}
              />
            </div>
          </div>

          <Button onClick={() => setGameMode('menu')} className="w-full h-12 text-lg mt-8">
            <Icon name="ArrowLeft" className="mr-2" size={20} />
            Назад в меню
          </Button>
        </Card>
      </div>
    );
  }

  if (gameMode === 'inventory') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/50 backdrop-blur p-4">
        <Card className="p-8 max-w-3xl w-full space-y-6">
          <h2 className="text-3xl font-bold text-center">Инвентарь</h2>
          
          <div className="grid grid-cols-9 gap-2">
            {inventory.map((slot, index) => (
              <div
                key={index}
                className="aspect-square border-2 border-border bg-muted flex flex-col items-center justify-center p-2 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => {
                  if (slot.type) {
                    setPlayer(prev => ({ ...prev, selectedSlot: index % 9 }));
                    setGameMode('playing');
                  }
                }}
              >
                {slot.type && (
                  <>
                    <div
                      className="w-full h-2/3 rounded"
                      style={{ 
                        backgroundColor: slot.type === 'tnt' ? '#FF0000' : BLOCK_COLORS[slot.type],
                        backgroundImage: slot.type === 'tnt' ? 'linear-gradient(45deg, #FF0000 25%, #FFFFFF 25%, #FFFFFF 50%, #FF0000 50%, #FF0000 75%, #FFFFFF 75%)' : 'none',
                        backgroundSize: '8px 8px'
                      }}
                    />
                    <span className="text-xs mt-1 font-bold">{slot.count}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          <Button onClick={() => setGameMode('playing')} className="w-full">
            Закрыть (ESC или E)
          </Button>
        </Card>
      </div>
    );
  }

  if (gameMode === 'creative') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/50 backdrop-blur p-4">
        <Card className="p-8 max-w-4xl w-full space-y-6">
          <h2 className="text-3xl font-bold text-center">Креативный режим</h2>
          
          <Tabs defaultValue="blocks" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="blocks">Блоки</TabsTrigger>
              <TabsTrigger value="inventory">Инвентарь</TabsTrigger>
            </TabsList>
            
            <TabsContent value="blocks" className="space-y-4">
              <div className="grid grid-cols-6 gap-3">
                {ALL_BLOCKS.map((blockType) => (
                  <div
                    key={blockType}
                    className="aspect-square border-2 border-border bg-muted flex flex-col items-center justify-center p-3 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => {
                      const emptySlot = inventory.find(s => s.type === null || s.type === blockType);
                      if (emptySlot) {
                        emptySlot.type = blockType;
                        emptySlot.count = 64;
                        setInventory([...inventory]);
                        toast({ title: `${blockType} добавлен в инвентарь` });
                      }
                    }}
                  >
                    <div
                      className="w-full h-3/4 rounded"
                      style={{ 
                        backgroundColor: blockType === 'tnt' ? '#FF0000' : BLOCK_COLORS[blockType],
                        backgroundImage: blockType === 'tnt' ? 'linear-gradient(45deg, #FF0000 25%, #FFFFFF 25%, #FFFFFF 50%, #FF0000 50%, #FF0000 75%, #FFFFFF 75%)' : 'none',
                        backgroundSize: '12px 12px'
                      }}
                    />
                    <span className="text-xs mt-1 capitalize font-bold">{blockType}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="inventory">
              <div className="grid grid-cols-9 gap-2">
                {inventory.map((slot, index) => (
                  <div
                    key={index}
                    className="aspect-square border-2 border-border bg-muted flex flex-col items-center justify-center p-2"
                  >
                    {slot.type && (
                      <>
                        <div
                          className="w-full h-2/3 rounded"
                          style={{ 
                            backgroundColor: slot.type === 'tnt' ? '#FF0000' : BLOCK_COLORS[slot.type],
                            backgroundImage: slot.type === 'tnt' ? 'linear-gradient(45deg, #FF0000 25%, #FFFFFF 25%, #FFFFFF 50%, #FF0000 50%, #FF0000 75%, #FFFFFF 75%)' : 'none',
                            backgroundSize: '8px 8px'
                          }}
                        />
                        <span className="text-xs mt-1 font-bold">{slot.count}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <Button onClick={() => setGameMode('playing')} className="w-full">
            Закрыть (ESC или C)
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      {!isPointerLocked && !isMobile && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Card className="p-6">
            <p className="text-center text-lg">Кликните для управления камерой</p>
          </Card>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {inventory.slice(0, 9).map((slot, index) => (
          <div
            key={index}
            className={`w-14 h-14 border-4 ${
              index === player.selectedSlot ? 'border-white' : 'border-gray-600'
            } bg-black/70 flex flex-col items-center justify-center`}
          >
            {slot.type && (
              <>
                <div
                  className="w-9 h-9 rounded"
                  style={{ 
                    backgroundColor: slot.type === 'tnt' ? '#FF0000' : BLOCK_COLORS[slot.type],
                    backgroundImage: slot.type === 'tnt' ? 'linear-gradient(45deg, #FF0000 25%, #FFFFFF 25%, #FFFFFF 50%, #FF0000 50%, #FF0000 75%, #FFFFFF 75%)' : 'none',
                    backgroundSize: '6px 6px'
                  }}
                />
                <span className="text-xs text-white font-bold">{slot.count}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur px-4 py-2 rounded text-sm text-white space-y-1">
        <p className="font-bold text-accent">Режим: {player.mode === 'creative' ? 'Креатив' : 'Выживание'}</p>
        <p>WASD - движение</p>
        {player.mode === 'creative' ? (
          <>
            <p>Пробел - вверх</p>
            <p>Shift - вниз</p>
          </>
        ) : (
          <>
            <p>Пробел - прыжок</p>
            <p>Shift - бег</p>
          </>
        )}
        <p>ЛКМ - разрушить/поджечь ТНТ</p>
        <p>ПКМ - поставить</p>
        <p>E - инвентарь</p>
        <p>C - креатив меню</p>
        <p>1-9 - выбор слота</p>
        <p>ESC - выход</p>
      </div>

      {isMobile && (
        <>
          <div
            className="absolute bottom-24 left-8 w-32 h-32 bg-black/30 border-2 border-white/30 rounded-full"
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = (touch.clientX - centerX) / (rect.width / 2);
              const dy = (touch.clientY - centerY) / (rect.height / 2);
              setJoystickPos({ x: dx, y: -dy });
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = Math.max(-1, Math.min(1, (touch.clientX - centerX) / (rect.width / 2)));
              const dy = Math.max(-1, Math.min(1, (touch.clientY - centerY) / (rect.height / 2)));
              setJoystickPos({ x: dx, y: -dy });
            }}
            onTouchEnd={() => setJoystickPos({ x: 0, y: 0 })}
          >
            <div
              className="absolute w-12 h-12 bg-white/50 rounded-full top-1/2 left-1/2"
              style={{
                transform: `translate(calc(-50% + ${joystickPos.x * 40}px), calc(-50% + ${-joystickPos.y * 40}px))`,
              }}
            />
          </div>

          <div
            className="absolute bottom-24 right-24 w-32 h-32 bg-black/30 border-2 border-white/30 rounded-full"
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = (touch.clientX - centerX) / (rect.width / 2);
              const dy = (touch.clientY - centerY) / (rect.height / 2);
              setLookJoystick({ x: dx, y: dy });
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = Math.max(-1, Math.min(1, (touch.clientX - centerX) / (rect.width / 2)));
              const dy = Math.max(-1, Math.min(1, (touch.clientY - centerY) / (rect.height / 2)));
              setLookJoystick({ x: dx, y: dy });
            }}
            onTouchEnd={() => setLookJoystick({ x: 0, y: 0 })}
          >
            <div
              className="absolute w-12 h-12 bg-white/50 rounded-full top-1/2 left-1/2"
              style={{
                transform: `translate(calc(-50% + ${lookJoystick.x * 40}px), calc(-50% + ${lookJoystick.y * 40}px))`,
              }}
            />
          </div>

          <div className="absolute bottom-4 right-8 space-y-2">
            <Button
              className="w-16 h-16 rounded-lg"
              onTouchStart={breakBlock}
            >
              <Icon name="Pickaxe" size={24} />
            </Button>
            <Button
              className="w-16 h-16 rounded-lg"
              onTouchStart={placeBlock}
            >
              <Icon name="Plus" size={24} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
