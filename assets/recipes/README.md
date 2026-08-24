# Zdjęcia dań

Wrzuć tutaj obrazy, potem dopisz je w `src/data/photos.ts`:

```ts
'spaghetti-bolognese': require('../../assets/recipes/spaghetti-bolognese.jpg'),
```

Nazwa pliku nie musi się zgadzać z id przepisu, ale ułatwia życie, gdy się zgadza.

## Czego trzymać się przy generowaniu

| | |
|---|---|
| Proporcje | 4:3 poziomo |
| Rozmiar | 1200 × 900 px wystarczy z zapasem |
| Format | JPG, jakość około 80 |
| Waga | do 150 KB na zdjęcie |

Miniatura na liście przepisów jest kwadratowa i przycina obraz do środka,
więc trzymaj danie mniej więcej pośrodku kadru. Na ekranie szczegółów
to samo zdjęcie leci jako szeroki pasek 16:9, też przycinany do środka.

Bez zdjęcia aplikacja działa normalnie i pokazuje neutralne miejsce na obraz.
Zdjęcia są ozdobne, nigdy nie blokują ekranu ani układania planu.

## Alternatywa: zdjęcia z sieci

Zamiast pliku można ustawić `photoUrl` przy przepisie w
`src/data/seed/recipes.json`. Plik z tego katalogu ma pierwszeństwo.
