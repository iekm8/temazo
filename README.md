# Temazo

Juego web multijugador de música urbana para jugar con amigos desde el móvil.
Uno crea una sala, comparte el código o el enlace, y van saliendo minijuegos:

- 🎧 **Adivina el tema**: suena un fragmento y gana quien escribe antes el título. Se aceptan erratas y van saliendo pistas, como en Pinturillo.
- 🤝 **¿Quién está en el feat?**: elige entre 4 artistas quién colabora en el tema.
- 📅 **¿De qué año es?**: cuanto más cerca, más puntos.

## Desarrollo

```powershell
npm install
npm run dev      # web en http://localhost:5173 (servidor de juego en :3001)
npm test         # tests de la lógica del juego
```

Para probar con amigos en la misma WiFi, abre en el móvil la dirección "Network" que muestra Vite.

## Producción

```powershell
npm run build
npm start        # sirve la web y el juego en el mismo puerto (PORT, por defecto 3001)
```

## Canciones

El catálogo se genera con los temas más populares en Deezer de los artistas de `FOCUS_ARTISTS` en `scripts/build-catalog.ts`
(Myke Towers, Bad Bunny, Mora, Eladio Carrión, Omar Courtz, J Balvin, Arcángel, Ozuna, Dei V y Tainy):

```powershell
npm run build-catalog -- 15   # 15 temas por artista -> server/data/songs.source.json
npm run resolve-songs         # portadas -> server/data/songs.json (lo que usa el juego)
```

Ojo: `build-catalog` sobrescribe `songs.source.json`. Si lo editas a mano (quitar un tema, corregir un año, añadir títulos alternativos en `alt`),
después ejecuta solo `resolve-songs`. En `build-catalog.ts` también están `DROP` (temas a excluir) y `RENAME` (títulos raros de Deezer).

El audio son las previews oficiales de 30 s de la API pública de Deezer, que se reproducen directamente desde su CDN.
