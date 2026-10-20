## MODIFIED Requirements

### Requirement: Oportunidad perdida
Una jugada clasificada Imprecisión o Error por la tabla SHALL pasar a Oportunidad perdida si, para el bando que mueve:
- la mejor jugada daba una posición ganadora: EP ≥ `MISS_WIN`;
- tras la jugada hecha, la posición deja de serlo: EP < `MISS_WIN`.

`MISS_WIN` SHALL ser 0.62 (≈ +1.3), calibrado con revisiones de chess.com (design D1). No SHALL exigirse que la jugada previa del rival haya sido un Error.

Un Blunder SHALL seguir siendo Blunder. Una jugada que conserva la posición ganadora SHALL clasificarse solo por su pérdida, aunque pierda mucho. Al cambiar la regla, `CLASSIFIER_VERSION` SHALL subir a 3.

#### Scenario: No aprovechar la ventaja
- **WHEN** la mejor jugada (d5) daba EP 0.69 y el usuario juega Ab5, que deja EP 0.55 (pérdida 0.14)
- **THEN** la jugada es Oportunidad perdida

#### Scenario: Ventaja que se conserva
- **WHEN** la mejor jugada daba EP 0.90 y la jugada hecha deja EP 0.77 (pérdida 0.13)
- **THEN** la jugada es Error, no Oportunidad perdida, porque la posición sigue ganadora

#### Scenario: Sin ventaja ganadora
- **WHEN** la mejor jugada daba EP 0.60 y la jugada hecha pierde 0.06
- **THEN** la jugada es Imprecisión

#### Scenario: Blunder que tira la ventaja
- **WHEN** la mejor jugada daba EP 0.85 y la jugada hecha deja EP 0.40 (pérdida 0.45)
- **THEN** la jugada sigue siendo Blunder

#### Scenario: Partida de referencia
- **WHEN** se clasifica CarlosAPV vs jyonGM53 (fixture de evaluaciones a profundidad 16)
- **THEN** las blancas tienen exactamente 3 Oportunidades perdidas (8.Ab5, 11.Ag5 y 12.Da4), igual que chess.com
