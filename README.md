# tool-beats

Job Node.js per il calcolo delle `battute` degli stampi/tool a partire dai dati presenti in SAP Business One, con persistenza opzionale su MySQL e aggiornamento del contatore corrente in SAP.

## Obiettivo

Il programma serve a rispondere a questa domanda:

> quante battute ha eseguito ogni stampo in un certo periodo, sulla base delle quantità movimentate degli articoli collegati?

Per farlo:

1. legge da SAP la relazione tra `tool` e articoli stampati;
2. ricostruisce la gerarchia BOM padre/figlio;
3. legge le quantità del periodo;
4. attribuisce i volumi ai tool;
5. calcola le battute;
6. opzionalmente salva il risultato su MySQL;
7. opzionalmente aggiorna in SAP il campo del contatore attuale.

## Stack e dipendenze

- Node.js
- `mssql` per connessione a SAP SQL Server
- `mysql2` per connessione al database applicativo MySQL
- `dayjs` per gestione date
- `dotenv` per configurazione ambiente

## Struttura del progetto

```text
src/
  db/
    mySql.js            Connessione MySQL
    sap.js              Connessione SAP SQL Server
  repositories/
    mySqlRepository.js  Accesso tabella tool_beats_month
    sapRepository.js    Query SAP per tool, BOM, quantità e stato tool
  services/
    beatsService.js     Logica principale di calcolo
    bomService.js       Risalita ricorsiva della BOM
  run-month.js          Esecuzione mese precedente
  run-history.js        Esecuzione storica multi-mese
  simulate-period.js    Simulazione su intervallo arbitrario
```

## Configurazione

Il progetto usa un file `.env`.

Variabili richieste:

### SAP

- `SAP_DB_USER`
- `SAP_DB_PASSWORD`
- `SAP_DB_SERVER`
- `SAP_DB_DATABASE`
- `SAP_DB_PORT`
- `SAP_DB_ENCRYPT`
- `SAP_DB_TRUST_CERT`

### MySQL applicativo

- `APP_DB_HOST`
- `APP_DB_USER`
- `APP_DB_PASSWORD`
- `APP_DB_DATABASE`
- `APP_DB_PORT`

### Parametri di business

- `EXTRA_BEATS`

`EXTRA_BEATS` rappresenta una maggiorazione percentuale applicata al calcolo finale delle battute. Se non valorizzata, il default nel codice è `1.5`.

## Concetti di business

### Tool

Lo stampo/attrezzatura per cui si vuole stimare il numero di battute.

### Printed item

L'articolo direttamente collegato al tool.

### BOM

La struttura padre/figlio usata per risalire da un componente o semilavorato agli articoli superiori che ne determinano il consumo.

### Battute

Il numero di cicli attribuiti al tool nel periodo analizzato.

## Come funziona il calcolo

La logica principale è in `src/services/beatsService.js`.

### 1. Lettura anagrafiche tool

Da SAP vengono letti:

- `tool_code`
- `printed_item`
- `item_molt`
- `item_cav`
- `divisor = item_molt * item_cav`

Vengono considerati solo i record con divisore diverso da zero.

Interpretazione pratica:

- `item_molt` e `item_cav` definiscono quante unità vengono prodotte per battuta;
- il loro prodotto è il divisore usato per convertire quantità prodotte/vendute in battute.

### 2. Lettura della BOM

Il programma carica da SAP tutti i legami `father -> child` dalla tabella `ITT1`.

Poi costruisce una mappa `child -> [fathers]` per risalire dai componenti agli articoli superiori.

### 3. Risalita ricorsiva della BOM

Per ogni `printed_item`, il servizio `bomService.js` cerca tutti i padri diretti e indiretti.

Durante questa risalita:

- moltiplica progressivamente le quantità BOM;
- evita loop ciclici nel grafo;
- interrompe l'espansione su alcuni codici presenti in `STOP_ITEMS`.

Il risultato è una lista di articoli padre con:

- articolo padre
- quantità BOM cumulata
- livello nella risalita
- percorso della risalita

### 4. Lettura quantità del periodo

Il programma interroga SAP nel range `startDate` / `endDate` e costruisce le quantità per articolo.

Le quantità arrivano da due fonti:

- `normal_qty`: quantità da documenti di acquisto `OPCH/PCH1`
- `fee_qty`: quantità collegate a righe fattura `OINV/INV1` con articolo `SERV50`

Le due componenti vengono sommate in:

- `total_qty = normal_qty + fee_qty`

### 5. Attribuzione quantità ai tool

Per ogni tool:

1. prende il `printed_item`;
2. risale tutti i padri BOM;
3. per ogni padre controlla se esiste una quantità nel periodo;
4. moltiplica la quantità del periodo per la quantità BOM cumulata;
5. somma il contributo al tool.

Formula per ciascun contributo:

```text
calculatedTotalQty = qtyByItem[fatherItem].total_qty * bomQty
beatsRaw = calculatedTotalQty / divisor
```

Il programma accumula per ogni tool:

- `normal_qty`
- `fee_qty`
- `total_qty`
- `beats_raw`

### 6. Applicazione maggiorazione e arrotondamento

Alla fine, per ogni tool:

```text
beats = ceil(beats_raw * (1 + EXTRA_BEATS / 100))
```

Quindi:

- viene applicata la percentuale extra;
- il risultato è sempre arrotondato per eccesso.

## Modalità operative

Il progetto supporta tre modalità.

### 1. Simulazione di un periodo arbitrario

File: `src/simulate-period.js`

Esegue il calcolo su un intervallo esplicito e stampa il risultato JSON a console.

Non scrive su MySQL e non aggiorna SAP.

Esempio:

```bash
npm run simulate -- --start=2026-01-01 --end=2026-01-31
```

Parametri obbligatori:

- `--start=YYYY-MM-DD`
- `--end=YYYY-MM-DD`

### 2. Calcolo del mese precedente

File: `src/run-month.js`

Calcola automaticamente il mese precedente rispetto alla data corrente oppure rispetto a una data passata con `--date`.

Esempio simulazione:

```bash
npm run month
```

Esempio scrittura:

```bash
npm run month -- --write
```

Esempio con data di riferimento:

```bash
npm run month -- --date=2026-06-18
```

Se la data di riferimento è `2026-06-18`, il periodo calcolato sarà:

- `startDate = 2026-05-01`
- `endDate = 2026-05-31`

Flag supportati:

- `--write` abilita la scrittura su MySQL e l'aggiornamento SAP
- `--overwrite` cancella i dati del mese già presenti prima di reinserirli
- `--date=YYYY-MM-DD` imposta la data di riferimento per determinare il mese precedente

### 3. Calcolo storico

File: `src/run-history.js`

Esegue il calcolo mese per mese su un intervallo storico.

Esempio simulazione:

```bash
npm run history -- --from=2025-01-01 --to=2025-12-01
```

Esempio scrittura:

```bash
npm run history -- --from=2025-01-01 --to=2025-12-01 --write
```

Parametri:

- `--from=YYYY-MM-DD`
- `--to=YYYY-MM-DD`
- `--write`
- `--overwrite`

Se `--to` non viene passato, il programma arriva fino al mese precedente rispetto alla data corrente.

## Cosa viene scritto su MySQL

Repository: `src/repositories/mySqlRepository.js`

Tabella usata:

- `tool_beats_month`

Campi inseriti:

- `tool_id`
- `beats`
- `date`

Il campo `date` rappresenta il primo giorno del mese analizzato, ad esempio `2026-05-01`.

### Regole di overwrite

Nel calcolo mensile e storico:

- se esistono già record per quella data e non è attivo `--overwrite`, il mese viene saltato o l'operazione viene rifiutata;
- se `--overwrite` è attivo, i record esistenti per quella data vengono cancellati e reinseriti.

## Cosa viene aggiornato in SAP

Solo in modalità `--write` del comando mensile, dopo l'inserimento su MySQL:

- legge lo stato del tool in `[@POL_TOOL_HEADER]`
- aggiorna `U_POL_BAT_NOW`

La logica è:

- normalmente `U_POL_BAT_NOW = valore_attuale + beats_del_mese`
- se esiste `U_POL_BAT_COUNTER_DATE` e la data del contatore cade dentro il periodo analizzato, allora il nuovo valore parte da `U_POL_BAT_COUNTER`

In pratica il programma gestisce il caso in cui durante il mese sia stato eseguito un reset o un riallineamento del contatore.

## Output dei comandi

I comandi stampano JSON su console.

### Output della simulazione periodo

Struttura:

```json
{
  "ok": true,
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "rows": []
}
```

### Output del calcolo mensile

Struttura:

```json
{
  "ok": true,
  "mode": "simulate|write",
  "period": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "rows": []
}
```

Ogni elemento di `rows` contiene:

- `tool_code`
- `normal_qty`
- `fee_qty`
- `total_qty`
- `beats_raw`
- `beats`

### Output dello storico

Restituisce un array con una riga per mese, ad esempio:

```json
[
  {
    "month": "2026-01-01",
    "skipped": false,
    "rows": 18
  }
]
```

## Esempi pratici

### Simulare un mese preciso

```bash
npm run simulate -- --start=2026-05-01 --end=2026-05-31
```

### Calcolare il mese precedente senza scrivere

```bash
npm run month
```

### Calcolare il mese precedente e salvare il risultato

```bash
npm run month -- --write
```

### Forzare il ricalcolo di un mese già presente

```bash
npm run month -- --write --overwrite --date=2026-06-18
```

### Lanciare uno storico

```bash
npm run history -- --from=2024-01-01 --to=2024-12-01 --write
```

## Note importanti

### Query e semantica dati

La logica di business dipende fortemente da:

- struttura delle tabelle SAP
- significato dei campi custom `U_POL_*`
- interpretazione dei documenti usati per costruire le quantità

Prima di modificare il comportamento, conviene validare con il reparto funzionale:

- perché `normal_qty` viene letto da `OPCH/PCH1`;
- perché `fee_qty` viene letto da fatture `OINV/INV1` con `SERV50`;
- quali codici vadano bloccati in `STOP_ITEMS`;
- cosa rappresentino esattamente `item_molt` e `item_cav`.

### Prestazioni

Il calcolo storico può essere costoso perché:

- carica tool, BOM e quantità;
- esegue una risalita ricorsiva della BOM;
- nel caso `--write` effettua molte scritture singole.

Su storici ampi è consigliabile procedere per blocchi di mesi.

### Sicurezza

- non versionare credenziali reali nel repository;
- evitare di condividere il file `.env`;
- valutare l'uso di utenti database con permessi minimi necessari.

## Avvio locale

Installazione dipendenze:

```bash
npm install
```

Comando più semplice per validare il setup:

```bash
npm run month
```

Se le connessioni e le query sono corrette, il programma stamperà il JSON del mese precedente in modalità simulazione.

## Possibili miglioramenti

- aggiungere test automatici per `bomService.js` e `beatsService.js`
- separare meglio la logica SAP da quella di calcolo puro
- introdurre logging strutturato
- aggiungere una validazione più robusta degli argomenti CLI
- gestire batch insert su MySQL
- documentare formalmente il significato funzionale dei campi `U_POL_*`

