import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';

type GameState = 'menu' | 'playing' | 'settings' | 'shop' | 'paused' | 'gameOver';

interface PlayerState {
  x: number;
  y: number;
  angle: number;
  health: number;
  coins: number;
  ammo: number;
  maxAmmo: number;
  currentWeapon: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  health: number;
  angle: number;
  shootTimer: number;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  angle: number;
  fromPlayer: boolean;
}

interface Item {
  id: number;
  x: number;
  y: number;
  type: 'health' | 'ammo' | 'coin';
}

interface Weapon {
  name: string;
  damage: number;
  fireRate: number;
  ammoPerShot: number;
  price: number;
  owned: boolean;
}

const WEAPONS: Weapon[] = [
  { name: 'Пистолет', damage: 10, fireRate: 500, ammoPerShot: 1, price: 0, owned: true },
  { name: 'Дробовик', damage: 30, fireRate: 800, ammoPerShot: 2, price: 50, owned: false },
  { name: 'Пулемёт', damage: 15, fireRate: 150, ammoPerShot: 1, price: 100, owned: false },
];

const MAP_SIZE = 50;
const TILE_SIZE = 64;
const WALL_HEIGHT = 64;

export default function Index() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [player, setPlayer] = useState<PlayerState>({
    x: 5,
    y: 5,
    angle: 0,
    health: 100,
    coins: 0,
    ammo: 50,
    maxAmmo: 50,
    currentWeapon: 0,
  });
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [weapons, setWeapons] = useState<Weapon[]>(WEAPONS);
  const [settings, setSettings] = useState({ volume: 50, graphics: 1 });
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [mouseX, setMouseX] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [lastShot, setLastShot] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();

  const map = useRef<number[][]>(
    Array(MAP_SIZE).fill(0).map((_, y) =>
      Array(MAP_SIZE).fill(0).map((_, x) => {
        if (x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1) return 1;
        if (Math.random() < 0.15) return 1;
        return 0;
      })
    )
  );

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const initGame = useCallback(() => {
    const newEnemies: Enemy[] = [];
    const newItems: Item[] = [];

    for (let i = 0; i < 10; i++) {
      let ex, ey;
      do {
        ex = Math.floor(Math.random() * (MAP_SIZE - 10)) + 5;
        ey = Math.floor(Math.random() * (MAP_SIZE - 10)) + 5;
      } while (map.current[ey][ex] !== 0 || (Math.abs(ex - 5) < 3 && Math.abs(ey - 5) < 3));

      newEnemies.push({
        id: i,
        x: ex,
        y: ey,
        health: 50,
        angle: 0,
        shootTimer: 0,
      });
    }

    for (let i = 0; i < 15; i++) {
      let ix, iy;
      do {
        ix = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
        iy = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
      } while (map.current[iy][ix] !== 0);

      const types: ('health' | 'ammo' | 'coin')[] = ['health', 'ammo', 'coin'];
      newItems.push({
        id: i,
        x: ix + 0.5,
        y: iy + 0.5,
        type: types[Math.floor(Math.random() * types.length)],
      });
    }

    setEnemies(newEnemies);
    setItems(newItems);
    setBullets([]);
    setPlayer(prev => ({ ...prev, x: 5, y: 5, angle: 0, health: 100 }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'playing') {
        setKeys(prev => new Set(prev).add(e.key.toLowerCase()));
        if (e.key === 'Escape') setGameState('paused');
        if (e.key >= '1' && e.key <= '3') {
          const weaponIndex = parseInt(e.key) - 1;
          if (weapons[weaponIndex].owned) {
            setPlayer(prev => ({ ...prev, currentWeapon: weaponIndex }));
          }
        }
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
      if (gameState === 'playing' && !isMobile) {
        setMouseX(e.movementX);
      }
    };

    const handleClick = () => {
      if (gameState === 'playing' && !isMobile) {
        shoot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
    };
  }, [gameState, isMobile]);

  const shoot = useCallback(() => {
    const now = Date.now();
    const weapon = weapons[player.currentWeapon];
    
    if (now - lastShot < weapon.fireRate || player.ammo < weapon.ammoPerShot) return;

    setLastShot(now);
    setPlayer(prev => ({ ...prev, ammo: prev.ammo - weapon.ammoPerShot }));

    const newBullet: Bullet = {
      id: Date.now(),
      x: player.x,
      y: player.y,
      angle: player.angle,
      fromPlayer: true,
    };

    setBullets(prev => [...prev, newBullet]);
  }, [player, weapons, lastShot]);

  const castRay = useCallback((angle: number, maxDist: number = 20): { dist: number; hitWall: boolean } => {
    const rayX = Math.cos(angle);
    const rayY = Math.sin(angle);
    
    for (let i = 0; i < maxDist * 10; i++) {
      const dist = i * 0.1;
      const x = player.x + rayX * dist;
      const y = player.y + rayY * dist;
      
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE || map.current[Math.floor(y)][Math.floor(x)] === 1) {
        return { dist, hitWall: true };
      }
    }
    
    return { dist: maxDist, hitWall: false };
  }, [player.x, player.y]);

  const gameLoop = useCallback(() => {
    if (gameState !== 'playing') return;

    setPlayer(prev => {
      let newX = prev.x;
      let newY = prev.y;
      let newAngle = prev.angle;

      if (isMobile) {
        newAngle += joystickPos.x * 0.05;
        const moveSpeed = 0.05;
        const dx = Math.cos(newAngle) * moveSpeed * joystickPos.y;
        const dy = Math.sin(newAngle) * moveSpeed * joystickPos.y;
        newX += dx;
        newY += dy;
      } else {
        newAngle += mouseX * 0.003;
        const moveSpeed = 0.1;
        
        if (keys.has('w')) {
          newX += Math.cos(newAngle) * moveSpeed;
          newY += Math.sin(newAngle) * moveSpeed;
        }
        if (keys.has('s')) {
          newX -= Math.cos(newAngle) * moveSpeed;
          newY -= Math.sin(newAngle) * moveSpeed;
        }
        if (keys.has('a')) {
          newX += Math.cos(newAngle - Math.PI / 2) * moveSpeed;
          newY += Math.sin(newAngle - Math.PI / 2) * moveSpeed;
        }
        if (keys.has('d')) {
          newX += Math.cos(newAngle + Math.PI / 2) * moveSpeed;
          newY += Math.sin(newAngle + Math.PI / 2) * moveSpeed;
        }
      }

      if (map.current[Math.floor(newY)][Math.floor(newX)] === 0) {
        return { ...prev, x: newX, y: newY, angle: newAngle };
      }
      
      return { ...prev, angle: newAngle };
    });

    setMouseX(0);

    setBullets(prev => {
      const updated = prev.map(b => ({
        ...b,
        x: b.x + Math.cos(b.angle) * 0.3,
        y: b.y + Math.sin(b.angle) * 0.3,
      })).filter(b => {
        if (b.x < 0 || b.y < 0 || b.x >= MAP_SIZE || b.y >= MAP_SIZE) return false;
        if (map.current[Math.floor(b.y)][Math.floor(b.x)] === 1) return false;
        return true;
      });

      return updated;
    });

    setEnemies(prev => {
      return prev.map(enemy => {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToPlayer = Math.atan2(dy, dx);

        const ray = castRay(angleToPlayer, dist);
        const canSeePlayer = !ray.hitWall && dist < 15;

        let newEnemy = { ...enemy, angle: angleToPlayer };

        if (canSeePlayer && dist > 2) {
          const moveSpeed = 0.03;
          const newX = enemy.x + Math.cos(angleToPlayer) * moveSpeed;
          const newY = enemy.y + Math.sin(angleToPlayer) * moveSpeed;
          
          if (map.current[Math.floor(newY)][Math.floor(newX)] === 0) {
            newEnemy = { ...newEnemy, x: newX, y: newY };
          }
        }

        if (canSeePlayer && newEnemy.shootTimer <= 0) {
          const newBullet: Bullet = {
            id: Date.now() + Math.random(),
            x: newEnemy.x,
            y: newEnemy.y,
            angle: angleToPlayer,
            fromPlayer: false,
          };
          setBullets(b => [...b, newBullet]);
          newEnemy.shootTimer = 60;
        } else if (newEnemy.shootTimer > 0) {
          newEnemy.shootTimer--;
        }

        return newEnemy;
      });
    });

    bullets.forEach(bullet => {
      if (bullet.fromPlayer) {
        setEnemies(prev => {
          let enemyHit = false;
          const updated = prev.map(enemy => {
            const dist = Math.sqrt((bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2);
            if (dist < 0.5 && !enemyHit) {
              enemyHit = true;
              const newHealth = enemy.health - weapons[player.currentWeapon].damage;
              if (newHealth <= 0) {
                const coinDrop = Math.floor(Math.random() * 3) + 1;
                setPlayer(p => ({ ...p, coins: p.coins + coinDrop }));
                setItems(i => [...i, {
                  id: Date.now() + Math.random(),
                  x: enemy.x,
                  y: enemy.y,
                  type: 'coin',
                }]);
                return null;
              }
              return { ...enemy, health: newHealth };
            }
            return enemy;
          }).filter(e => e !== null) as Enemy[];

          if (enemyHit) {
            setBullets(b => b.filter(b => b.id !== bullet.id));
          }

          return updated;
        });
      } else {
        const dist = Math.sqrt((bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2);
        if (dist < 0.5) {
          setPlayer(p => {
            const newHealth = p.health - 10;
            if (newHealth <= 0) {
              setGameState('gameOver');
            }
            return { ...p, health: Math.max(0, newHealth) };
          });
          setBullets(b => b.filter(b => b.id !== bullet.id));
        }
      }
    });

    items.forEach(item => {
      const dist = Math.sqrt((item.x - player.x) ** 2 + (item.y - player.y) ** 2);
      if (dist < 0.7) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        
        if (item.type === 'health') {
          setPlayer(p => ({ ...p, health: Math.min(100, p.health + 25) }));
          toast({ title: '+25 HP' });
        } else if (item.type === 'ammo') {
          setPlayer(p => ({ ...p, ammo: Math.min(p.maxAmmo, p.ammo + 20) }));
          toast({ title: '+20 патронов' });
        } else if (item.type === 'coin') {
          setPlayer(p => ({ ...p, coins: p.coins + 1 }));
        }
      }
    });

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, player, keys, mouseX, bullets, items, enemies, isMobile, joystickPos, castRay, weapons, toast]);

  useEffect(() => {
    if (gameState === 'playing') {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameState, gameLoop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameState !== 'playing') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const FOV = Math.PI / 3;
    const NUM_RAYS = settings.graphics === 2 ? 320 : settings.graphics === 1 ? 160 : 80;
    const MAX_DEPTH = 20;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

    for (let i = 0; i < NUM_RAYS; i++) {
      const rayAngle = player.angle - FOV / 2 + (i / NUM_RAYS) * FOV;
      const ray = castRay(rayAngle, MAX_DEPTH);
      
      const correctedDist = ray.dist * Math.cos(rayAngle - player.angle);
      const wallHeight = (WALL_HEIGHT / correctedDist) * (canvas.height / 2);
      
      const brightness = Math.max(0, 1 - correctedDist / MAX_DEPTH);
      const color = Math.floor(brightness * 150);
      
      ctx.fillStyle = `rgb(${color}, ${color * 0.8}, ${color * 0.6})`;
      ctx.fillRect(
        (i / NUM_RAYS) * canvas.width,
        canvas.height / 2 - wallHeight / 2,
        Math.ceil(canvas.width / NUM_RAYS) + 1,
        wallHeight
      );
    }

    const spritesToRender: Array<{ dist: number; render: () => void }> = [];

    enemies.forEach(enemy => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToEnemy = Math.atan2(dy, dx);
      let relativeAngle = angleToEnemy - player.angle;
      
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      if (Math.abs(relativeAngle) < FOV / 2 + 0.5) {
        const ray = castRay(angleToEnemy, dist);
        if (!ray.hitWall || ray.dist > dist) {
          spritesToRender.push({
            dist,
            render: () => {
              const screenX = (relativeAngle / FOV + 0.5) * canvas.width;
              const spriteHeight = (WALL_HEIGHT / dist) * (canvas.height / 2);
              const brightness = Math.max(0, 1 - dist / MAX_DEPTH);
              
              ctx.fillStyle = `rgba(255, ${100 * brightness}, ${100 * brightness}, ${brightness})`;
              ctx.fillRect(
                screenX - spriteHeight / 4,
                canvas.height / 2 - spriteHeight / 2,
                spriteHeight / 2,
                spriteHeight
              );
              
              ctx.fillStyle = `rgba(200, ${80 * brightness}, ${80 * brightness}, ${brightness * 0.8})`;
              ctx.beginPath();
              ctx.arc(
                screenX,
                canvas.height / 2 - spriteHeight / 4,
                spriteHeight / 6,
                0,
                Math.PI * 2
              );
              ctx.fill();
            },
          });
        }
      }
    });

    items.forEach(item => {
      const dx = item.x - player.x;
      const dy = item.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToItem = Math.atan2(dy, dx);
      let relativeAngle = angleToItem - player.angle;
      
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      if (Math.abs(relativeAngle) < FOV / 2 + 0.5) {
        const ray = castRay(angleToItem, dist);
        if (!ray.hitWall || ray.dist > dist) {
          spritesToRender.push({
            dist,
            render: () => {
              const screenX = (relativeAngle / FOV + 0.5) * canvas.width;
              const spriteHeight = (WALL_HEIGHT / 2 / dist) * (canvas.height / 2);
              
              const colors = {
                health: 'rgba(0, 255, 0, 0.8)',
                ammo: 'rgba(255, 255, 0, 0.8)',
                coin: 'rgba(255, 215, 0, 0.8)',
              };
              
              ctx.fillStyle = colors[item.type];
              ctx.fillRect(
                screenX - spriteHeight / 2,
                canvas.height / 2 - spriteHeight / 2,
                spriteHeight,
                spriteHeight
              );
            },
          });
        }
      }
    });

    spritesToRender.sort((a, b) => b.dist - a.dist).forEach(sprite => sprite.render());

    const miniMapSize = 150;
    const miniMapScale = miniMapSize / MAP_SIZE;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, 10, miniMapSize, miniMapSize);

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (map.current[y][x] === 1) {
          ctx.fillStyle = '#555';
          ctx.fillRect(
            10 + x * miniMapScale,
            10 + y * miniMapScale,
            miniMapScale,
            miniMapScale
          );
        }
      }
    }

    enemies.forEach(enemy => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleToEnemy = Math.atan2(dy, dx);
      const ray = castRay(angleToEnemy, dist);
      
      if (!ray.hitWall || ray.dist > dist) {
        ctx.fillStyle = '#f00';
        ctx.fillRect(
          10 + enemy.x * miniMapScale - 2,
          10 + enemy.y * miniMapScale - 2,
          4,
          4
        );
      }
    });

    ctx.fillStyle = '#0ff';
    ctx.fillRect(
      10 + player.x * miniMapScale - 3,
      10 + player.y * miniMapScale - 3,
      6,
      6
    );

  }, [player, enemies, items, gameState, settings, castRay]);

  const startGame = () => {
    initGame();
    setGameState('playing');
  };

  if (gameState === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-card p-4">
        <Card className="p-8 max-w-md w-full space-y-6 bg-card/80 backdrop-blur border-primary/20">
          <div className="text-center space-y-2">
            <h1 className="text-6xl font-bold text-primary tracking-wider" style={{ fontFamily: 'monospace' }}>
              DOOM
            </h1>
            <p className="text-muted-foreground">Классический 3D шутер</p>
          </div>
          
          <div className="space-y-3">
            <Button onClick={startGame} className="w-full h-12 text-lg" variant="default">
              Новая игра
            </Button>
            <Button onClick={() => setGameState('shop')} className="w-full h-12 text-lg" variant="secondary">
              <Icon name="ShoppingCart" className="mr-2" size={20} />
              Магазин оружия
            </Button>
            <Button onClick={() => setGameState('settings')} className="w-full h-12 text-lg" variant="outline">
              <Icon name="Settings" className="mr-2" size={20} />
              Настройки
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground pt-4 border-t border-border">
            <p>Монеты: {player.coins} 🪙</p>
          </div>
        </Card>
      </div>
    );
  }

  if (gameState === 'settings') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-card p-4">
        <Card className="p-8 max-w-md w-full space-y-6">
          <h2 className="text-3xl font-bold text-primary">Настройки</h2>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Громкость: {settings.volume}%</label>
              <Slider
                value={[settings.volume]}
                onValueChange={([v]) => setSettings(s => ({ ...s, volume: v }))}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Качество графики</label>
              <div className="grid grid-cols-3 gap-2">
                {['Низкое', 'Среднее', 'Высокое'].map((q, i) => (
                  <Button
                    key={q}
                    variant={settings.graphics === i ? 'default' : 'outline'}
                    onClick={() => setSettings(s => ({ ...s, graphics: i }))}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={() => setGameState('menu')} className="w-full" variant="secondary">
            Назад
          </Button>
        </Card>
      </div>
    );
  }

  if (gameState === 'shop') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-card p-4">
        <Card className="p-8 max-w-2xl w-full space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-primary">Магазин оружия</h2>
            <div className="text-xl font-bold">🪙 {player.coins}</div>
          </div>
          
          <div className="space-y-3">
            {weapons.map((weapon, index) => (
              <Card key={weapon.name} className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">{weapon.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Урон: {weapon.damage} | Скорострельность: {1000/weapon.fireRate}/с
                  </p>
                </div>
                <div>
                  {weapon.owned ? (
                    <Button variant="outline" disabled>
                      <Icon name="Check" size={16} className="mr-2" />
                      Куплено
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (player.coins >= weapon.price) {
                          setPlayer(p => ({ ...p, coins: p.coins - weapon.price }));
                          setWeapons(w => w.map((wp, i) =>
                            i === index ? { ...wp, owned: true } : wp
                          ));
                          toast({ title: `${weapon.name} куплен!` });
                        } else {
                          toast({ title: 'Недостаточно монет', variant: 'destructive' });
                        }
                      }}
                      disabled={player.coins < weapon.price}
                    >
                      {weapon.price} 🪙
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Button onClick={() => setGameState('menu')} className="w-full" variant="secondary">
            Назад
          </Button>
        </Card>
      </div>
    );
  }

  if (gameState === 'paused') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/80 backdrop-blur">
        <Card className="p-8 max-w-md w-full space-y-4">
          <h2 className="text-3xl font-bold text-center text-primary">Пауза</h2>
          <div className="space-y-2">
            <Button onClick={() => setGameState('playing')} className="w-full">
              Продолжить
            </Button>
            <Button onClick={() => setGameState('menu')} className="w-full" variant="outline">
              Главное меню
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (gameState === 'gameOver') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/80 backdrop-blur">
        <Card className="p-8 max-w-md w-full space-y-4">
          <h2 className="text-4xl font-bold text-center text-destructive">Вы погибли</h2>
          <div className="text-center space-y-2">
            <p className="text-xl">Собрано монет: {player.coins}</p>
            <p className="text-muted-foreground">Убито врагов: {10 - enemies.length}</p>
          </div>
          <div className="space-y-2">
            <Button onClick={startGame} className="w-full">
              Играть снова
            </Button>
            <Button onClick={() => setGameState('menu')} className="w-full" variant="outline">
              Главное меню
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 backdrop-blur px-6 py-3 rounded-lg">
        <div className="flex items-center gap-2">
          <Icon name="Heart" size={20} className="text-destructive" />
          <span className="font-bold">{player.health}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="Crosshair" size={20} className="text-accent" />
          <span className="font-bold">{player.ammo}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>🪙</span>
          <span className="font-bold">{player.coins}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="Zap" size={20} className="text-secondary" />
          <span className="font-bold">{weapons[player.currentWeapon].name}</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-black/70 backdrop-blur px-4 py-2 rounded-lg text-sm">
        <p>ESC - пауза</p>
        {!isMobile && <p>WASD - движение</p>}
        {!isMobile && <p>Мышь - взгляд</p>}
        {!isMobile && <p>ЛКМ - стрелять</p>}
        <p>1-3 - оружие</p>
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
              className="absolute w-12 h-12 bg-white/50 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                transform: `translate(calc(-50% + ${joystickPos.x * 40}px), calc(-50% + ${-joystickPos.y * 40}px))`,
              }}
            />
          </div>

          <Button
            className="absolute bottom-24 right-8 w-20 h-20 rounded-full"
            onTouchStart={shoot}
            size="lg"
          >
            <Icon name="Crosshair" size={32} />
          </Button>
        </>
      )}
    </div>
  );
}
