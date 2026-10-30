#include <math.h>
#include <stddef.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define GAME_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define GAME_EXPORT
#endif

#define MAP_WIDTH 16
#define MAP_HEIGHT 16
#define ENEMY_COUNT 5
#define LEVEL_COUNT 3
#define HEALTH_PICKUP_COUNT ENEMY_COUNT
#define PLAYER_RADIUS 0.2f
#define PLAYER_SPEED 3.2f
#define HEALTH_PICKUP_RADIUS 0.4f
#define HEALTH_PICKUP_AMOUNT 25
#define PI_F 3.14159265358979323846f
#define MAGAZINE_SIZE 12
#define ENEMY_ATTACK_RANGE 0.78f
#define ENEMY_ATTACK_ANIMATION_TIME 0.48f
#define ENEMY_TYPE_IMP 0
#define ENEMY_TYPE_HEAVY 1
#define ENEMY_TYPE_RUNNER 2
#define ENEMY_TYPE_SHOOTER 3
#define ENEMY_PROJECTILE_SPEED 4.5f
#define ENEMY_SHOT_RANGE 9.0f
#define ENEMY_HIT_FLASH_TIME 0.16f
#define ENEMY_TYPE_COUNT 4

static const char world_map[MAP_HEIGHT][MAP_WIDTH + 1] = {
    "################",
    "#..............#",
    "#..##..........#",
    "#..............#",
    "#......#.......#",
    "#......#.......#",
    "#..............#",
    "#....##........#",
    "#..............#",
    "#..........#...#",
    "#..........#...#",
    "#..............#",
    "#..#...........#",
    "#..#...........#",
    "#..............#",
    "################"
};

typedef struct {
    float x;
    float y;
    float attack_cooldown;
    float attack_animation_time;
    float projectile_x;
    float projectile_y;
    float projectile_vx;
    float projectile_vy;
    float hit_flash_time;
    int type;
    int projectile_active;
    int health;
    int max_health;
    int alive;
} Enemy;

static const float enemy_positions[ENEMY_COUNT][2] = {
    {2.5f, 7.5f},
    {11.5f, 5.5f},
    {4.5f, 8.5f},
    {8.5f, 11.5f},
    {13.5f, 13.5f}
};
static const int enemy_types[LEVEL_COUNT][ENEMY_COUNT] = {
    {ENEMY_TYPE_IMP, ENEMY_TYPE_IMP, ENEMY_TYPE_RUNNER,
     ENEMY_TYPE_IMP, ENEMY_TYPE_RUNNER},
    {ENEMY_TYPE_HEAVY, ENEMY_TYPE_SHOOTER, ENEMY_TYPE_HEAVY,
     ENEMY_TYPE_RUNNER, ENEMY_TYPE_SHOOTER},
    {ENEMY_TYPE_SHOOTER, ENEMY_TYPE_HEAVY, ENEMY_TYPE_RUNNER,
     ENEMY_TYPE_SHOOTER, ENEMY_TYPE_HEAVY}
};
static const int enemy_health[LEVEL_COUNT][ENEMY_TYPE_COUNT] = {
    {2, 3, 2, 2},
    {3, 4, 3, 3},
    {4, 6, 4, 5}
};

static float player_x = 2.5f;
static float player_y = 2.5f;
static float player_angle;
static float shot_cooldown;
static int health;
static int magazine;
static int reserve_ammo;
static int kills;
static int level;
static int level_kills;
static int health_pickups_collected;
static Enemy enemies[ENEMY_COUNT];
static int health_pickups_alive[HEALTH_PICKUP_COUNT];
static float health_pickup_x[HEALTH_PICKUP_COUNT];
static float health_pickup_y[HEALTH_PICKUP_COUNT];

static void reset_level_enemies(void)
{
    int index;

    health_pickups_collected = 0;
    for (index = 0; index < HEALTH_PICKUP_COUNT; ++index) {
        health_pickups_alive[index] = 0;
        health_pickup_x[index] = 0.0f;
        health_pickup_y[index] = 0.0f;
    }

    for (index = 0; index < ENEMY_COUNT; ++index) {
        enemies[index].x = enemy_positions[index][0];
        enemies[index].y = enemy_positions[index][1];
        enemies[index].attack_cooldown = 0.0f;
        enemies[index].attack_animation_time = 0.0f;
        enemies[index].projectile_x = 0.0f;
        enemies[index].projectile_y = 0.0f;
        enemies[index].projectile_vx = 0.0f;
        enemies[index].projectile_vy = 0.0f;
        enemies[index].hit_flash_time = 0.0f;
        enemies[index].type = enemy_types[level - 1][index];
        enemies[index].max_health = enemy_health[level - 1][enemies[index].type];
        enemies[index].health = enemies[index].max_health;
        enemies[index].projectile_active = 0;
        enemies[index].alive = 1;
    }
}

static float clamp_delta(float delta_time)
{
    if (!isfinite(delta_time) || delta_time < 0.0f) {
        return 0.0f;
    }

    return delta_time > 0.1f ? 0.1f : delta_time;
}

static int is_wall(int map_x, int map_y)
{
    if (map_x < 0 || map_x >= MAP_WIDTH || map_y < 0 || map_y >= MAP_HEIGHT) {
        return 1;
    }

    return world_map[map_y][map_x] == '#';
}

static int circle_hits_wall(float x, float y)
{
    int min_x = (int)floorf(x - PLAYER_RADIUS);
    int max_x = (int)floorf(x + PLAYER_RADIUS);
    int min_y = (int)floorf(y - PLAYER_RADIUS);
    int max_y = (int)floorf(y + PLAYER_RADIUS);
    float radius_squared = PLAYER_RADIUS * PLAYER_RADIUS;
    int map_x;
    int map_y;

    for (map_y = min_y; map_y <= max_y; ++map_y) {
        for (map_x = min_x; map_x <= max_x; ++map_x) {
            float closest_x;
            float closest_y;
            float difference_x;
            float difference_y;

            if (!is_wall(map_x, map_y)) {
                continue;
            }

            closest_x = fmaxf((float)map_x, fminf(x, (float)map_x + 1.0f));
            closest_y = fmaxf((float)map_y, fminf(y, (float)map_y + 1.0f));
            difference_x = x - closest_x;
            difference_y = y - closest_y;
            if (difference_x * difference_x + difference_y * difference_y < radius_squared) {
                return 1;
            }
        }
    }

    return 0;
}

static int has_line_of_sight(float target_x, float target_y)
{
    float difference_x = target_x - player_x;
    float difference_y = target_y - player_y;
    float distance = sqrtf(difference_x * difference_x + difference_y * difference_y);
    int steps = (int)(distance * 12.0f);
    int step;

    for (step = 1; step < steps; ++step) {
        float fraction = (float)step / (float)steps;
        int map_x = (int)floorf(player_x + difference_x * fraction);
        int map_y = (int)floorf(player_y + difference_y * fraction);

        if (is_wall(map_x, map_y)) {
            return 0;
        }
    }

    return 1;
}

GAME_EXPORT void game_init(void)
{
    player_x = 2.5f;
    player_y = 2.5f;
    player_angle = PI_F * 0.5f;
    shot_cooldown = 0.0f;
    health = 100;
    magazine = MAGAZINE_SIZE;
    reserve_ammo = 48;
    kills = 0;
    level = 1;
    level_kills = 0;
    health_pickups_collected = 0;
    reset_level_enemies();
}

GAME_EXPORT int game_get_map_width(void)
{
    return MAP_WIDTH;
}

GAME_EXPORT int game_get_map_height(void)
{
    return MAP_HEIGHT;
}

GAME_EXPORT int game_get_map_cell(int map_x, int map_y)
{
    if (map_x < 0 || map_x >= MAP_WIDTH || map_y < 0 || map_y >= MAP_HEIGHT) {
        return '#';
    }

    return (unsigned char)world_map[map_y][map_x];
}

GAME_EXPORT void game_move(float forward, float strafe, float delta_time)
{
    float length;
    float direction_x;
    float direction_y;
    float movement_x;
    float movement_y;
    float safe_delta = clamp_delta(delta_time);
    float movement_length;
    float step_x;
    float step_y;
    int step_count;
    int step;

    if (!isfinite(forward) || !isfinite(strafe) || safe_delta == 0.0f) {
        return;
    }

    length = sqrtf(forward * forward + strafe * strafe);
    if (length > 1.0f) {
        forward /= length;
        strafe /= length;
    }

    direction_x = cosf(player_angle);
    direction_y = sinf(player_angle);
    movement_x = (direction_x * forward - direction_y * strafe) * PLAYER_SPEED * safe_delta;
    movement_y = (direction_y * forward + direction_x * strafe) * PLAYER_SPEED * safe_delta;
    movement_length = sqrtf(movement_x * movement_x + movement_y * movement_y);
    step_count = (int)ceilf(movement_length / 0.05f);
    if (step_count < 1) {
        step_count = 1;
    }
    step_x = movement_x / (float)step_count;
    step_y = movement_y / (float)step_count;

    for (step = 0; step < step_count; ++step) {
        int pickup;

        if (!circle_hits_wall(player_x + step_x, player_y)) {
            player_x += step_x;
        }
        if (!circle_hits_wall(player_x, player_y + step_y)) {
            player_y += step_y;
        }

        for (pickup = 0; pickup < HEALTH_PICKUP_COUNT; ++pickup) {
            float difference_x;
            float difference_y;
            float pickup_distance_squared;

            if (!health_pickups_alive[pickup] || health >= 100) {
                continue;
            }

            difference_x = player_x - health_pickup_x[pickup];
            difference_y = player_y - health_pickup_y[pickup];
            pickup_distance_squared = difference_x * difference_x + difference_y * difference_y;
            if (pickup_distance_squared <= HEALTH_PICKUP_RADIUS * HEALTH_PICKUP_RADIUS) {
                health += HEALTH_PICKUP_AMOUNT;
                if (health > 100) {
                    health = 100;
                }
                health_pickups_alive[pickup] = 0;
                ++health_pickups_collected;
            }
        }
    }
}

GAME_EXPORT void game_rotate(float radians)
{
    if (!isfinite(radians)) {
        return;
    }

    player_angle += radians;
    while (player_angle > PI_F) {
        player_angle -= 2.0f * PI_F;
    }
    while (player_angle < -PI_F) {
        player_angle += 2.0f * PI_F;
    }
}

GAME_EXPORT void game_shoot(void)
{
    const float shot_cone = 0.11f;
    const float maximum_range = 9.0f;
    int target = -1;
    int index;
    float nearest_distance = maximum_range;

    if (health <= 0 || magazine <= 0 || shot_cooldown > 0.0f) {
        return;
    }

    --magazine;
    shot_cooldown = 0.28f;

    for (index = 0; index < ENEMY_COUNT; ++index) {
        float difference_x;
        float difference_y;
        float distance;
        float angle_to_enemy;
        float angle_difference;

        if (!enemies[index].alive) {
            continue;
        }

        difference_x = enemies[index].x - player_x;
        difference_y = enemies[index].y - player_y;
        distance = sqrtf(difference_x * difference_x + difference_y * difference_y);
        angle_to_enemy = atan2f(difference_y, difference_x);
        angle_difference = atan2f(sinf(angle_to_enemy - player_angle),
                                  cosf(angle_to_enemy - player_angle));

        if (distance < nearest_distance && fabsf(angle_difference) <= shot_cone &&
            has_line_of_sight(enemies[index].x, enemies[index].y)) {
            nearest_distance = distance;
            target = index;
        }
    }

    if (target >= 0) {
        --enemies[target].health;
        enemies[target].hit_flash_time = ENEMY_HIT_FLASH_TIME;
        if (enemies[target].health <= 0) {
            enemies[target].alive = 0;
            enemies[target].projectile_active = 0;
            health_pickup_x[target] = enemies[target].x;
            health_pickup_y[target] = enemies[target].y;
            health_pickups_alive[target] = 1;
            ++kills;
            ++level_kills;
        }
    }
}

GAME_EXPORT void game_reload(void)
{
    int needed;

    if (health <= 0 || magazine == MAGAZINE_SIZE || reserve_ammo <= 0) {
        return;
    }

    needed = MAGAZINE_SIZE - magazine;
    if (needed > reserve_ammo) {
        needed = reserve_ammo;
    }

    magazine += needed;
    reserve_ammo -= needed;
}

GAME_EXPORT void game_update(float delta_time)
{
    float safe_delta = clamp_delta(delta_time);
    int index;

    if (safe_delta == 0.0f || health <= 0) {
        return;
    }

    if (shot_cooldown > 0.0f) {
        shot_cooldown -= safe_delta;
        if (shot_cooldown < 0.0f) {
            shot_cooldown = 0.0f;
        }
    }

    for (index = 0; index < ENEMY_COUNT; ++index) {
        float difference_x;
        float difference_y;
        float distance;

        if (!enemies[index].alive) {
            continue;
        }

        if (enemies[index].attack_cooldown > 0.0f) {
            enemies[index].attack_cooldown -= safe_delta;
        }
        if (enemies[index].attack_animation_time > 0.0f) {
            enemies[index].attack_animation_time -= safe_delta;
            if (enemies[index].attack_animation_time < 0.0f) {
                enemies[index].attack_animation_time = 0.0f;
            }
        }
        if (enemies[index].hit_flash_time > 0.0f) {
            enemies[index].hit_flash_time -= safe_delta;
            if (enemies[index].hit_flash_time < 0.0f) {
                enemies[index].hit_flash_time = 0.0f;
            }
        }

        if (enemies[index].projectile_active) {
            float projectile_step_x = enemies[index].projectile_vx * safe_delta;
            float projectile_step_y = enemies[index].projectile_vy * safe_delta;
            float next_x = enemies[index].projectile_x + projectile_step_x;
            float next_y = enemies[index].projectile_y + projectile_step_y;
            float player_difference_x;
            float player_difference_y;
            float player_distance;

            if (is_wall((int)floorf(next_x), (int)floorf(next_y))) {
                enemies[index].projectile_active = 0;
            } else {
                enemies[index].projectile_x = next_x;
                enemies[index].projectile_y = next_y;
                player_difference_x = player_x - next_x;
                player_difference_y = player_y - next_y;
                player_distance = sqrtf(player_difference_x * player_difference_x
                                        + player_difference_y * player_difference_y);
                if (player_distance <= PLAYER_RADIUS + 0.12f) {
                    health -= 9 + (level - 1) * 2;
                    if (health < 0) {
                        health = 0;
                    }
                    enemies[index].projectile_active = 0;
                }
            }
        }

        difference_x = player_x - enemies[index].x;
        difference_y = player_y - enemies[index].y;
        distance = sqrtf(difference_x * difference_x + difference_y * difference_y);

        {
            if (enemies[index].type == ENEMY_TYPE_SHOOTER) {
                const float ideal_distance = 4.2f;
                if (distance > 0.0001f &&
                    (distance > ideal_distance + 0.65f || distance < ideal_distance - 1.0f)) {
                    float movement_direction = distance < ideal_distance ? -1.0f : 1.0f;
                    float step_x = difference_x / distance * 0.32f * movement_direction * safe_delta;
                    float step_y = difference_y / distance * 0.32f * movement_direction * safe_delta;

                    if (!is_wall((int)floorf(enemies[index].x + step_x),
                                 (int)floorf(enemies[index].y))) {
                        enemies[index].x += step_x;
                    }
                    if (!is_wall((int)floorf(enemies[index].x),
                                 (int)floorf(enemies[index].y + step_y))) {
                        enemies[index].y += step_y;
                    }
                } else if (!enemies[index].projectile_active &&
                           enemies[index].attack_cooldown <= 0.0f &&
                           distance <= ENEMY_SHOT_RANGE &&
                           has_line_of_sight(enemies[index].x, enemies[index].y)) {
                    float aim_x = difference_x / distance;
                    float aim_y = difference_y / distance;

                    enemies[index].projectile_x = enemies[index].x;
                    enemies[index].projectile_y = enemies[index].y;
                    enemies[index].projectile_vx = aim_x * ENEMY_PROJECTILE_SPEED;
                    enemies[index].projectile_vy = aim_y * ENEMY_PROJECTILE_SPEED;
                    enemies[index].projectile_active = 1;
                    enemies[index].attack_cooldown = 1.8f;
                    enemies[index].attack_animation_time = ENEMY_ATTACK_ANIMATION_TIME;
                }
                continue;
            }
        }

        {
            float attack_range = enemies[index].type == ENEMY_TYPE_HEAVY ? 0.92f
                : enemies[index].type == ENEMY_TYPE_RUNNER ? 0.7f : ENEMY_ATTACK_RANGE;

            if (distance > attack_range) {
                float move_speed = enemies[index].type == ENEMY_TYPE_HEAVY ? 0.4f
                    : enemies[index].type == ENEMY_TYPE_RUNNER ? 0.78f : 0.55f;
                float level_speed = 1.0f + (float)(level - 1) * 0.12f;
                float step_x = difference_x / distance * move_speed * level_speed * safe_delta;
                float step_y = difference_y / distance * move_speed * level_speed * safe_delta;

                if (!is_wall((int)floorf(enemies[index].x + step_x), (int)floorf(enemies[index].y))) {
                    enemies[index].x += step_x;
                }
                if (!is_wall((int)floorf(enemies[index].x), (int)floorf(enemies[index].y + step_y))) {
                    enemies[index].y += step_y;
                }
            } else if (enemies[index].attack_cooldown <= 0.0f &&
                       has_line_of_sight(enemies[index].x, enemies[index].y)) {
                int damage = enemies[index].type == ENEMY_TYPE_HEAVY ? 12
                    : enemies[index].type == ENEMY_TYPE_RUNNER ? 6 : 8;
                health -= damage + (level - 1) * 2;
                if (health < 0) {
                    health = 0;
                }
                enemies[index].attack_cooldown = enemies[index].type == ENEMY_TYPE_HEAVY ? 1.25f
                    : enemies[index].type == ENEMY_TYPE_RUNNER ? 0.82f : 1.0f;
                enemies[index].attack_animation_time = ENEMY_ATTACK_ANIMATION_TIME;
            }
        }
    }
}

GAME_EXPORT float game_get_player_x(void)
{
    return player_x;
}

GAME_EXPORT float game_get_player_y(void)
{
    return player_y;
}

GAME_EXPORT float game_get_player_angle(void)
{
    return player_angle;
}

GAME_EXPORT int game_get_health(void)
{
    return health;
}

GAME_EXPORT int game_get_health_pickup_count(void)
{
    return HEALTH_PICKUP_COUNT;
}

GAME_EXPORT int game_get_health_pickup_alive(int index)
{
    if (index < 0 || index >= HEALTH_PICKUP_COUNT) {
        return 0;
    }

    return health_pickups_alive[index];
}

GAME_EXPORT float game_get_health_pickup_x(int index)
{
    if (index < 0 || index >= HEALTH_PICKUP_COUNT) {
        return -1.0f;
    }

    return health_pickup_x[index];
}

GAME_EXPORT float game_get_health_pickup_y(int index)
{
    if (index < 0 || index >= HEALTH_PICKUP_COUNT) {
        return -1.0f;
    }

    return health_pickup_y[index];
}

GAME_EXPORT int game_get_health_pickup_heal(void)
{
    return HEALTH_PICKUP_AMOUNT;
}

GAME_EXPORT int game_get_health_pickups_collected(void)
{
    return health_pickups_collected;
}

GAME_EXPORT int game_get_ammo(void)
{
    return magazine;
}

GAME_EXPORT int game_get_reserve_ammo(void)
{
    return reserve_ammo;
}

GAME_EXPORT int game_get_kills(void)
{
    return kills;
}

GAME_EXPORT int game_get_enemy_count(void)
{
    return ENEMY_COUNT;
}

GAME_EXPORT int game_get_level(void)
{
    return level;
}

GAME_EXPORT int game_get_level_count(void)
{
    return LEVEL_COUNT;
}

GAME_EXPORT int game_get_level_kills(void)
{
    return level_kills;
}

GAME_EXPORT int game_advance_level(void)
{
    if (level >= LEVEL_COUNT || level_kills < ENEMY_COUNT || health <= 0) {
        return 0;
    }

    ++level;
    level_kills = 0;
    health += 18;
    if (health > 100) {
        health = 100;
    }
    reserve_ammo += 8;
    reset_level_enemies();
    return 1;
}

GAME_EXPORT int game_get_enemy_alive(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0;
    }

    return enemies[index].alive;
}

GAME_EXPORT float game_get_enemy_x(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return -1.0f;
    }

    return enemies[index].x;
}

GAME_EXPORT float game_get_enemy_y(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return -1.0f;
    }

    return enemies[index].y;
}

GAME_EXPORT float game_get_enemy_attack_time(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0.0f;
    }

    return enemies[index].attack_animation_time;
}

GAME_EXPORT int game_get_enemy_type(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return -1;
    }

    return enemies[index].type;
}

GAME_EXPORT int game_get_enemy_projectile_active(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0;
    }

    return enemies[index].projectile_active;
}

GAME_EXPORT float game_get_enemy_projectile_x(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return -1.0f;
    }

    return enemies[index].projectile_x;
}

GAME_EXPORT float game_get_enemy_projectile_y(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return -1.0f;
    }

    return enemies[index].projectile_y;
}

GAME_EXPORT int game_get_enemy_health(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0;
    }

    return enemies[index].health;
}

GAME_EXPORT int game_get_enemy_max_health(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0;
    }

    return enemies[index].max_health;
}

GAME_EXPORT float game_get_enemy_hit_time(int index)
{
    if (index < 0 || index >= ENEMY_COUNT) {
        return 0.0f;
    }

    return enemies[index].hit_flash_time;
}
