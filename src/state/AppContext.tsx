import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  Catalog,
  ConsumptionLine,
  DietTag,
  PantryItem,
  PlanEntry,
  Recipe,
} from '../core/types.ts';
import {
  PlanError,
  createPlan,
  planForMeals,
  scaleAmount,
  swapMeal,
  type PlanResult,
} from '../core/optimizer.ts';
import {
  addManualToPantry,
  addPurchaseToPantry,
  adjustPantryItem,
  correctConsumption,
  markCooked,
  pantryTotals,
  perishableValue,
  removePantryItem,
  undoCooked,
} from '../core/pantry.ts';
import {
  DEFAULT_SETTINGS,
  createLocalStore,
  newPlanEntry,
  type DataStore,
  type NewProductInput,
  type Settings,
  type StandingPurchase,
  type ExtraPurchase,
  type WeekRecord,
} from '../data/store.ts';
import { newId } from '../data/ids.ts';

/**
 * Stan aplikacji. Context zamiast Reduxa, zgodnie ze specyfikacja.
 *
 * Ten plik jest JEDYNYM miejscem, ktore laczy rdzen z ekranami.
 * Komponenty nie wolaja optymalizatora ani magazynu bezposrednio.
 */

const EMPTY_CATALOG: Catalog = { products: [], recipes: [] };

/** Ile sekund wisi komunikat po oznaczeniu dania jako ugotowane. */
const TOAST_MS = 5000;

export interface Toast {
  text: string;
  /** Danie, ktorego dotyczy przycisk "Popraw". */
  recipeId: string;
}

interface AppValue {
  ready: boolean;
  catalog: Catalog;
  settings: Settings;
  pantry: PantryItem[];
  plan: PlanResult | null;
  entries: PlanEntry[];
  bought: string[];
  owned: string[];
  toast: Toast | null;
  standing: StandingPurchase[];
  /** Produkty dorzucone recznie do listy na ten tydzien. */
  extras: ExtraPurchase[];
  /** Zamkniete tygodnie, od najstarszego. */
  history: WeekRecord[];
  busy: boolean;
  error: string | null;

  setPeople(value: number): void;
  setDaysWithDinner(value: number): void;
  setDaysPerDish(value: number): void;
  toggleTag(tag: DietTag): void;

  /** Zmiana "na ile dni" przy jednym daniu. Optymalizator NIE rusza skladu. */
  setEntryDays(recipeId: string, days: number): void;
  /** Zmiana liczby porcji przy jednym daniu. Tak samo, bez ruszania skladu. */
  setEntryServings(recipeId: string, servings: number): void;

  generatePlan(): void;
  clearPlan(): void;
  replaceMeal(recipeId: string): void;

  /** Dodanie z zakladki Przepisy. Danie jest od razu przypiete. */
  addToWeek(recipeId: string): void;
  togglePinned(recipeId: string): void;

  toggleCooked(recipeId: string): void;
  applyCorrection(recipeId: string, lines: ConsumptionLine[]): void;
  dismissToast(): void;

  toggleBought(productId: string): void;
  toggleOwned(productId: string): void;

  /** Stale zakupy: rzeczy kupowane co tydzien niezaleznie od planu. */
  addStanding(productId: string, quantity: number): void;
  removeStanding(id: string): void;

  /** Dorzucenie produktu do listy zakupow poza planem. */
  addExtra(productId: string, quantity: number): void;
  removeExtra(id: string): void;

  addProduct(input: NewProductInput): Promise<void>;
  addToPantry(productId: string, amount: number): void;
  editPantryItem(itemId: string, amount: number): void;
  deletePantryItem(itemId: string): void;

  recipeById(id: string): Recipe | undefined;
  entryFor(recipeId: string): PlanEntry | undefined;
  /** Zuzycie do pokazania w panelu korekty: zapisane albo wyliczone z przepisu. */
  consumptionFor(recipeId: string): ConsumptionLine[];
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp musi byc uzyte wewnatrz <AppProvider>');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<DataStore>(createLocalStore(AsyncStorage));
  const store = storeRef.current;

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [bought, setBought] = useState<string[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [standing, setStanding] = useState<StandingPurchase[]>([]);
  const [extras, setExtras] = useState<ExtraPurchase[]>([]);
  const [history, setHistory] = useState<WeekRecord[]>([]);
  /** Kiedy zaczal sie biezacy tydzien. Potrzebne do archiwizacji. */
  const [planStartedAt, setPlanStartedAt] = useState<string | null>(null);

  /** Punkt odniesienia z pierwotnego generowania planu. */
  const baselineRef = useRef<number | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- wczytanie ----------------------------------------------------------

  useEffect(() => {
    let alive = true;
    (async () => {
      const [
        loadedCatalog,
        loadedSettings,
        loadedPantry,
        loadedStanding,
        loadedExtras,
        storedPlan,
        loadedHistory,
      ] =
        await Promise.all([
          store.getCatalog(),
          store.getSettings(),
          store.getPantry(),
          store.getStandingPurchases(),
          store.getExtraPurchases(),
          store.getPlan(),
          store.getHistory(),
        ]);
      if (!alive) return;

      setCatalog(loadedCatalog);
      setSettings(loadedSettings);
      setPantry(loadedPantry);
      setStanding(loadedStanding);
      setExtras(loadedExtras);
      setHistory(loadedHistory);

      if (storedPlan && storedPlan.entries.length > 0) {
        setEntries(storedPlan.entries);
        setPlanStartedAt(storedPlan.createdAt);
        setBought(storedPlan.boughtProductIds);
        setOwned(storedPlan.skippedProductIds);
        try {
          setPlan(
            planForMeals(
              {
                people: storedPlan.people,
                daysWithDinner: storedPlan.entries.length,
                daysPerDish: 1,
                forcedDishCount: storedPlan.entries.length,
                scalingByRecipe: Object.fromEntries(
                  storedPlan.entries.map((e) => [
                    e.recipeId,
                    { servings: e.servings, daysCovered: e.daysCovered },
                  ]),
                ),
                excludedTags: [],
                pantry: pantryTotals(loadedPantry),
                ownedProductIds: storedPlan.skippedProductIds,
                pinnedRecipeIds: storedPlan.entries.filter((e) => e.pinned).map((e) => e.recipeId),
              },
              loadedCatalog,
              storedPlan.entries.map((e) => e.recipeId),
            ),
          );
        } catch {
          // Plan wskazuje na przepis, ktorego juz nie ma. Zaczynamy od nowa.
          await store.savePlan(null);
          setEntries([]);
        }
      }
      setReady(true);
    })();
    return () => {
      alive = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [store]);

  // --- utrwalanie ---------------------------------------------------------

  useEffect(() => {
    if (ready) void store.savePantry(pantry);
  }, [ready, pantry, store]);

  useEffect(() => {
    if (ready) void store.saveSettings(settings);
  }, [ready, settings, store]);

  useEffect(() => {
    if (ready) void store.saveStandingPurchases(standing);
  }, [ready, standing, store]);

  useEffect(() => {
    if (ready) void store.saveExtraPurchases(extras);
  }, [ready, extras, store]);

  useEffect(() => {
    if (ready) void store.saveHistory(history);
  }, [ready, history, store]);

  useEffect(() => {
    if (!ready) return;
    if (entries.length === 0) {
      void store.savePlan(null);
      return;
    }
    void store.savePlan({
      id: 'current',
      userId: null,
      createdAt: planStartedAt ?? new Date().toISOString(),
      people: settings.people,
      entries,
      boughtProductIds: bought,
      skippedProductIds: owned,
    });
  }, [ready, entries, bought, owned, settings.people, planStartedAt, store]);

  // --- pomocnicze ---------------------------------------------------------

  const pinnedIds = useMemo(
    () => entries.filter((e) => e.pinned).map((e) => e.recipeId),
    [entries],
  );

  /** Nadpisania skalowania z pozycji planu. Klucz to id przepisu. */
  const scalingFrom = useCallback(
    (list: PlanEntry[]) =>
      Object.fromEntries(
        list.map((e) => [e.recipeId, { servings: e.servings, daysCovered: e.daysCovered }]),
      ),
    [],
  );

  const planInput = useCallback(
    (
      over: Partial<{
        ownedProductIds: string[];
        pinnedRecipeIds: string[];
        forcedDishCount: number;
        entries: PlanEntry[];
      }> = {},
    ) => ({
      people: settings.people,
      daysWithDinner: settings.daysWithDinner,
      daysPerDish: settings.daysPerDish,
      excludedTags: settings.excludedTags,
      pantry: pantryTotals(pantry),
      ownedProductIds: over.ownedProductIds ?? owned,
      pinnedRecipeIds: over.pinnedRecipeIds ?? pinnedIds,
      scalingByRecipe: scalingFrom(over.entries ?? entries),
      // Stale zakupy i reczne dokupki licza sie tak samo: sumuja sie
      // z przepisami PRZED zaokragleniem do opakowan.
      standingPurchases: [...standing, ...extras].map((s) => ({
        productId: s.productId,
        quantity: s.quantity,
      })),
      ...(over.forcedDishCount !== undefined ? { forcedDishCount: over.forcedDishCount } : {}),
    }),
    [settings, pantry, owned, pinnedIds, entries, scalingFrom, standing, extras],
  );

  const guard = useCallback((action: () => void) => {
    setBusy(true);
    setError(null);
    try {
      action();
    } catch (err) {
      setError(
        err instanceof PlanError && err.code === 'NOT_ENOUGH_RECIPES'
          ? 'Za mało przepisów po wykluczeniach. Odznacz coś albo zmniejsz liczbę obiadów.'
          : 'Nie udało się ułożyć planu.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  /** Przelicza koszty i liste dla USTALONEGO zestawu dan. Menu zostaje. */
  const recomputeFor = useCallback(
    (nextEntries: PlanEntry[], nextOwned: string[]) => {
      if (nextEntries.length === 0) {
        setPlan(null);
        return;
      }
      guard(() => {
        setPlan(
          planForMeals(
            planInput({
              ownedProductIds: nextOwned,
              pinnedRecipeIds: nextEntries.filter((e) => e.pinned).map((e) => e.recipeId),
              forcedDishCount: nextEntries.length,
              entries: nextEntries,
            }),
            catalog,
            nextEntries.map((e) => e.recipeId),
            undefined,
            baselineRef.current,
          ),
        );
      });
    },
    [guard, planInput, catalog],
  );

  // --- plan ---------------------------------------------------------------

  /**
   * Zamkniecie biezacego tygodnia. Wolane w chwili ulozenia nowego planu.
   *
   * Faktyczna wartosc resztek to wartosc produktow PSUJACYCH SIE, ktore
   * zostaly w spizarni. Produkty trwale zostaja na kolejny tydzien.
   */
  const archiveWeek = useCallback(() => {
    if (entries.length === 0 || plan === null) return;
    const now = new Date().toISOString();
    setHistory((prev) => [
      ...prev,
      {
        id: newId(),
        userId: null,
        from: planStartedAt ?? now,
        to: now,
        dishes: entries
          .map((e) => catalog.recipes.find((r) => r.id === e.recipeId)?.name)
          .filter((name): name is string => Boolean(name)),
        cost: plan.totalCost,
        forecastLeftover: plan.leftoverValue,
        actualLeftover: perishableValue(pantry, catalog.products),
      },
    ]);
  }, [entries, plan, planStartedAt, catalog, pantry]);

  const generatePlan = useCallback(() => {
    archiveWeek();
    guard(() => {
      const result = createPlan(planInput({ ownedProductIds: [] }), catalog);
      baselineRef.current = result.averagePlanLeftoverValue;

      const pinnedSet = new Set(pinnedIds);
      const previous = new Map(entries.map((e) => [e.recipeId, e]));

      // Dania przypiete zachowuja swoj stan, reszta startuje od zera.
      setEntries(
        result.meals.map((meal) =>
          pinnedSet.has(meal.id)
            ? (previous.get(meal.id) ??
              newPlanEntry(meal.id, true, settings.people, settings.daysPerDish))
            : newPlanEntry(meal.id, false, settings.people, settings.daysPerDish),
        ),
      );
      setPlan(result);
      setBought([]);
      setOwned([]);
      // Reczne dokupki dotyczyly poprzedniego tygodnia.
      setExtras([]);
      setPlanStartedAt(new Date().toISOString());
    });
  }, [
    archiveWeek, guard, planInput, catalog, pinnedIds, entries,
    settings.people, settings.daysPerDish,
  ]);

  const clearPlan = useCallback(() => {
    setEntries([]);
    setPlan(null);
    setBought([]);
    setOwned([]);
    baselineRef.current = undefined;
  }, []);

  const replaceMeal = useCallback(
    (recipeId: string) => {
      const entry = entries.find((e) => e.recipeId === recipeId);
      if (!entry || entry.pinned) return;

      guard(() => {
        const result = swapMeal(
          planInput({ forcedDishCount: entries.length }),
          catalog,
          entries.map((e) => e.recipeId),
          recipeId,
          undefined,
          baselineRef.current,
        );
        const newIds = result.meals.map((m) => m.id);
        const replacement = newIds.find((id) => !entries.some((e) => e.recipeId === id));

        setEntries((prev) =>
          prev.map((e) =>
            e.recipeId === recipeId && replacement
              ? newPlanEntry(replacement, false, e.servings, e.daysCovered)
              : e,
          ),
        );
        setPlan(result);
      });
    },
    [entries, guard, planInput, catalog],
  );

  /**
   * Dodanie dania z zakladki Przepisy. Danie jest od razu PRZYPIETE, wiec
   * optymalizator nigdy go nie usunie ani nie podmieni.
   */
  const addToWeek = useCallback(
    (recipeId: string) => {
      if (entries.some((e) => e.recipeId === recipeId)) return;

      const next = [
        ...entries,
        newPlanEntry(recipeId, true, settings.people, settings.daysPerDish),
      ];
      setEntries(next);

      // Gdy przypietych jest wiecej niz plan przewiduje, rozszerzamy tydzien.
      const needDays = next.filter((e) => e.pinned).length * settings.daysPerDish;
      if (needDays > settings.daysWithDinner) {
        setSettings((s) => ({ ...s, daysWithDinner: needDays }));
      }
      recomputeFor(next, owned);
    },
    [entries, settings.people, settings.daysPerDish, settings.daysWithDinner, owned, recomputeFor],
  );

  const setEntryDays = useCallback(
    (recipeId: string, days: number) => {
      const next = entries.map((e) =>
        e.recipeId === recipeId ? { ...e, daysCovered: Math.max(1, Math.min(3, days)) } : e,
      );
      setEntries(next);
      recomputeFor(next, owned);
    },
    [entries, owned, recomputeFor],
  );

  const setEntryServings = useCallback(
    (recipeId: string, servings: number) => {
      const next = entries.map((e) =>
        e.recipeId === recipeId ? { ...e, servings: Math.max(1, servings) } : e,
      );
      setEntries(next);
      recomputeFor(next, owned);
    },
    [entries, owned, recomputeFor],
  );

  const togglePinned = useCallback(
    (recipeId: string) => {
      const next = entries.map((e) =>
        e.recipeId === recipeId ? { ...e, pinned: !e.pinned } : e,
      );
      setEntries(next);
    },
    [entries],
  );

  // --- ugotowane ----------------------------------------------------------

  const showToast = useCallback((next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  /**
   * Checkbox przy daniu w planie oraz przycisk na ekranie przepisu.
   * Oba miejsca operuja na tym samym stanie.
   */
  const toggleCooked = useCallback(
    (recipeId: string) => {
      const entry = entries.find((e) => e.recipeId === recipeId);
      const recipe = catalog.recipes.find((r) => r.id === recipeId);
      if (!entry || !recipe) return;

      if (entry.cooked) {
        // Cofniecie: zwracamy DOKLADNIE to, co zostalo odjete.
        const restored = undoCooked(pantry, entry.consumption ?? [], new Date().toISOString(), newId);
        setPantry(restored);
        setEntries((prev) =>
          prev.map((e) =>
            e.recipeId === recipeId ? { ...e, cooked: false, consumption: null } : e,
          ),
        );
        dismissToast();
        return;
      }

      const result = markCooked(pantry, recipe, entry.servings, entry.daysCovered);
      setPantry(result.pantry);
      setEntries((prev) =>
        prev.map((e) =>
          e.recipeId === recipeId ? { ...e, cooked: true, consumption: result.consumption } : e,
        ),
      );
      showToast({ text: 'Odjęto składniki', recipeId });
    },
    [entries, catalog, pantry, showToast, dismissToast],
  );

  const applyCorrection = useCallback(
    (recipeId: string, lines: ConsumptionLine[]) => {
      const entry = entries.find((e) => e.recipeId === recipeId);
      if (!entry) return;

      const result = correctConsumption(
        pantry,
        entry.consumption ?? [],
        lines,
        new Date().toISOString(),
        newId,
      );
      setPantry(result.pantry);
      setEntries((prev) =>
        prev.map((e) =>
          e.recipeId === recipeId ? { ...e, cooked: true, consumption: result.consumption } : e,
        ),
      );
      dismissToast();
    },
    [entries, pantry, dismissToast],
  );

  const consumptionFor = useCallback(
    (recipeId: string): ConsumptionLine[] => {
      const entry = entries.find((e) => e.recipeId === recipeId);
      if (entry?.consumption) return entry.consumption;

      // Danie jeszcze nieugotowane: pokazujemy zapotrzebowanie z przepisu.
      const recipe = catalog.recipes.find((r) => r.id === recipeId);
      if (!recipe) return [];
      const servings = entry?.servings ?? settings.people;
      const days = entry?.daysCovered ?? settings.daysPerDish;
      return recipe.ingredients.map((ing) => ({
        productId: ing.productId,
        amount:
          Math.round(scaleAmount(ing.amount, servings, recipe.baseServings, days) * 100) / 100,
      }));
    },
    [entries, catalog, settings.people, settings.daysPerDish],
  );

  // --- lista zakupow ------------------------------------------------------

  const toggleBought = useCallback(
    (productId: string) => {
      if (!plan) return;
      const item = plan.shoppingList.find((i) => i.product.id === productId);
      if (!item) return;

      if (bought.includes(productId)) {
        setBought((prev) => prev.filter((id) => id !== productId));
        return;
      }

      setBought((prev) => [...prev, productId]);
      setPantry((prev) =>
        addPurchaseToPantry(
          prev,
          item.product,
          item.product.soldAs === 'luz' ? item.needed - item.fromPantry : item.packCount,
          new Date().toISOString(),
          newId,
        ),
      );
    },
    [plan, bought],
  );

  const toggleOwned = useCallback(
    (productId: string) => {
      const next = owned.includes(productId)
        ? owned.filter((id) => id !== productId)
        : [...owned, productId];
      setOwned(next);
      recomputeFor(entries, next);
    },
    [owned, entries, recomputeFor],
  );

  // --- spizarnia i katalog ------------------------------------------------

  const addStanding = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) return;
      setStanding((prev) => {
        const existing = prev.find((s) => s.productId === productId);
        if (existing) {
          return prev.map((s) => (s.productId === productId ? { ...s, quantity } : s));
        }
        return [...prev, { id: newId(), userId: null, productId, quantity }];
      });
    },
    [],
  );

  const removeStanding = useCallback((id: string) => {
    setStanding((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addExtra = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) return;
      setExtras((prev) => {
        const existing = prev.find((s) => s.productId === productId);
        if (existing) {
          return prev.map((s) => (s.productId === productId ? { ...s, quantity } : s));
        }
        return [...prev, { id: newId(), userId: null, productId, quantity }];
      });
    },
    [],
  );

  const removeExtra = useCallback((id: string) => {
    setExtras((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addProduct = useCallback(
    async (input: NewProductInput) => {
      await store.addCustomProduct(input);
      setCatalog(await store.getCatalog());
    },
    [store],
  );

  const addToPantry = useCallback((productId: string, amount: number) => {
    setPantry((prev) => addManualToPantry(prev, productId, amount, new Date().toISOString(), newId));
  }, []);

  const editPantryItem = useCallback((itemId: string, amount: number) => {
    setPantry((prev) => adjustPantryItem(prev, itemId, amount));
  }, []);

  const deletePantryItem = useCallback((itemId: string) => {
    setPantry((prev) => removePantryItem(prev, itemId));
  }, []);

  const recipeById = useCallback(
    (id: string) => catalog.recipes.find((r) => r.id === id),
    [catalog],
  );

  const entryFor = useCallback(
    (recipeId: string) => entries.find((e) => e.recipeId === recipeId),
    [entries],
  );

  const value = useMemo<AppValue>(
    () => ({
      ready, catalog, settings, pantry, plan, entries, bought, owned, toast, standing, extras,
      history, busy, error,
      setPeople: (people) => setSettings((s) => ({ ...s, people: Math.max(1, people) })),
      setDaysWithDinner: (days) =>
        setSettings((s) => ({ ...s, daysWithDinner: Math.max(1, Math.min(7, days)) })),
      setDaysPerDish: (days) =>
        setSettings((s) => ({ ...s, daysPerDish: Math.max(1, Math.min(3, days)) })),
      toggleTag: (tag) =>
        setSettings((s) => ({
          ...s,
          excludedTags: s.excludedTags.includes(tag)
            ? s.excludedTags.filter((t) => t !== tag)
            : [...s.excludedTags, tag],
        })),
      setEntryDays, setEntryServings,
      generatePlan, clearPlan, replaceMeal, addToWeek, togglePinned,
      toggleCooked, applyCorrection, dismissToast,
      toggleBought, toggleOwned,
      addStanding, removeStanding, addExtra, removeExtra,
      addProduct, addToPantry, editPantryItem, deletePantryItem,
      recipeById, entryFor, consumptionFor,
    }),
    [
      ready, catalog, settings, pantry, plan, entries, bought, owned, toast, standing, extras,
      history, busy, error,
      addStanding, removeStanding, addExtra, removeExtra,
      setEntryDays, setEntryServings,
      generatePlan, clearPlan, replaceMeal, addToWeek, togglePinned,
      toggleCooked, applyCorrection, dismissToast, toggleBought, toggleOwned,
      addProduct, addToPantry, editPantryItem, deletePantryItem,
      recipeById, entryFor, consumptionFor,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
