import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';

type GameMode = 'menu' | 'playing' | 'inventory' | 'creative';
type BlockType = 'air' | 'grass' | 'dirt' | 'stone' | 'wood' | 'planks' | 'leaves' | 'water' | 'sand' | 'cobblestone' | 'glass' | 'brick';

interface Block {
  type: BlockType;
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
};

const ALL_BLOCKS: BlockType[] = ['grass', 'dirt', 'stone', 'wood', 'planks', 'leaves', 'sand', 'cobblestone', 'glass', 'brick', 'water'];

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

  const startGame = (mode: 'survival' | 'creative') => {
    worldRef.current.clear();
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
      } else if ((gameMode === 'inventory' || gameMode === 'creative') && (e.key === 'Escape' || e.key === 'e' || e.key === 'E' || e.key === 'c' || e.key === 'C')) {
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
          angleY: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.angleY + e.movementY * 0.002)),
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
    const dirY = Math.sin(player.angleY);
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
  }, [raycast, getBlock, setBlock, inventory, player.mode]);

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
        newAngleY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newAngleY + lookJoystick.y * 0.03));
        
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

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameMode, keys, isMobile, joystickPos, lookJoystick, getBlock]);

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

    const FOV = Math.PI / 2.5;
    const NUM_RAYS_H = isMobile ? 80 : 160;
    const NUM_RAYS_V = isMobile ? 60 : 120;

    for (let rayY = 0; rayY < NUM_RAYS_V; rayY++) {
      for (let rayX = 0; rayX < NUM_RAYS_H; rayX++) {
        const angleH = player.angleX - FOV / 2 + (rayX / NUM_RAYS_H) * FOV;
        const angleV = player.angleY - (FOV * 0.6) / 2 + (rayY / NUM_RAYS_V) * (FOV * 0.6);

        const dirX = Math.cos(angleV) * Math.cos(angleH);
        const dirY = Math.sin(angleV);
        const dirZ = Math.cos(angleV) * Math.sin(angleH);

        const step = 0.1;
        let hitBlock: Block | null = null;
        let hitDist = 0;
        let hitFace = 0;

        for (let i = 0; i < 150; i++) {
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
          const brightness = Math.max(0.3, 1 - hitDist / 15);
          const faceBrightness = hitFace === 0 ? 1 : hitFace === 1 ? 0.6 : 0.8;
          
          const color = BLOCK_COLORS[hitBlock.type];
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

  }, [player, gameMode, getBlock, isMobile]);

  if (gameMode === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-700 to-green-900 p-4">
        <Card className="p-8 max-w-md w-full space-y-6 bg-card/90 backdrop-blur">
          <div className="text-center space-y-2">
            <h1 className="text-6xl font-bold text-primary" style={{ fontFamily: 'monospace' }}>
              MINECRAFT
            </h1>
            <p className="text-muted-foreground">Воксельный мир</p>
          </div>
          
          <div className="space-y-3">
            <Button onClick={() => startGame('survival')} className="w-full h-12 text-lg">
              <Icon name="Sword" className="mr-2" size={20} />
              Выживание
            </Button>
            <Button onClick={() => startGame('creative')} className="w-full h-12 text-lg" variant="secondary">
              <Icon name="Sparkles" className="mr-2" size={20} />
              Креатив
            </Button>
          </div>
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
                      style={{ backgroundColor: BLOCK_COLORS[slot.type] }}
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
                      style={{ backgroundColor: BLOCK_COLORS[blockType] }}
                    />
                    <span className="text-xs mt-1 capitalize">{blockType}</span>
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
                          style={{ backgroundColor: BLOCK_COLORS[slot.type] }}
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
                  style={{ backgroundColor: BLOCK_COLORS[slot.type] }}
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
        <p>ЛКМ - разрушить</p>
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
