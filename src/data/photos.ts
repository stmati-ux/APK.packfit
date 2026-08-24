import type { ImageSourcePropType } from 'react-native';

/**
 * Zdjecia dan.
 *
 * Dwie mozliwe drogi, sprawdzane w tej kolejnosci:
 *
 *   1. PLIK W PACZCE — wrzuc obraz do assets/recipes i dopisz go nizej.
 *      Dziala offline, nic nie dociaga, wchodzi do rozmiaru aplikacji.
 *      To domyslna droga dla zdjec, ktore robicie sami.
 *
 *   2. ADRES W SIECI — ustaw `photoUrl` przy przepisie w recipes.json.
 *      Uzywane, gdy zdjecia beda kiedys hostowane zamiast pakowane.
 *
 * Metro wymaga, zeby `require` mial sciezke wpisana na sztywno, dlatego
 * mapa jest recznie prowadzona. Nie da sie jej wygenerowac z id w locie.
 *
 * Dodanie zdjecia to jedna linijka, na przyklad:
 *
 *   'spaghetti-bolognese': require('../../assets/recipes/spaghetti-bolognese.jpg'),
 *
 * Nazwa pliku nie musi sie zgadzac z id, ale ulatwia zycie, gdy sie zgadza.
 */
export const BUNDLED_RECIPE_PHOTOS: Record<string, ImageSourcePropType> = {
  // tu wchodza zdjecia wrzucone do assets/recipes
};

/**
 * Wybiera zrodlo zdjecia dla przepisu. Zwraca null, gdy nie ma zadnego,
 * i wtedy interfejs pokazuje neutralne miejsce na zdjecie.
 */
export function recipePhoto(
  recipeId: string,
  photoUrl: string | null,
): ImageSourcePropType | null {
  const bundled = BUNDLED_RECIPE_PHOTOS[recipeId];
  if (bundled) return bundled;
  if (photoUrl) return { uri: photoUrl };
  return null;
}
