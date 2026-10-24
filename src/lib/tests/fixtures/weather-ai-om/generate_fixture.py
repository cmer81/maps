"""Génère la fixture du pseudo-domaine weather_ai_wnc_mini (tests maps).

Mêmes réglages que le producteur weather-ai (`scripts/wn2/om_publish.py`, #266) :
OM v3, `pfor_delta_2d_int16`, chunks 64×64, float32, grille [181, 360] du sud
au nord et de −180 à 179, `pressure_msl` en hPa (facteur 20) et
`cyclone_existence_probability` en fraction 0..1 (facteur 1000), scalaire
`metadata` à la racine. Champs synthétiques analytiques, pas une prévision.

Scénario : run 00Z achevé (`latest.json`, sans .om) et run 06Z en cours de
publication progressive (`in-progress.json` avec `completed: false` et les
deux seules échéances déposées, sans `meta.json`). Le run 00Z est un ancien
run (reçu `om-maps-receipt/1`) : ni vent ni précipitation dans `variables`. Le
run 06Z porte en plus `precipitation` (cumul en mm sur les 6 h précédant
l'échéance, facteur 10) et `wind_u_component_10m` / `wind_v_component_10m`
(m/s, facteur 100), comme les couches maps de weather-ai#318.

Régénération (omfiles 1.2.0) :
    python -I generate_fixture.py <dossier de cette fixture>
"""
import json
import sys
from pathlib import Path

import numpy as np
from omfiles import OmFileWriter

DOMAIN = 'weather_ai_wnc_mini'
LAT = np.arange(-90, 91, dtype=np.float64)
LON = np.arange(-180, 180, dtype=np.float64)
GRID_LAT, GRID_LON = np.meshgrid(LAT, LON, indexing='ij')


def pressure(offset):
    # Plan incliné exactement représentable au pas de 0,05 hPa : la valeur
    # attendue en tout point de grille se recalcule dans le test.
    return 1000 + 0.2 * GRID_LAT + 0.1 * GRID_LON + offset


def probability():
    # Bosse centrée sur un cyclone synthétique déclaré à 20° S / 55° E.
    d2 = (GRID_LAT + 20) ** 2 + (GRID_LON - 55) ** 2
    return np.round(0.9 * np.exp(-d2 / (2 * 4.0**2)), 3)


def precipitation():
    # Cumul 6 h : 12 mm au centre du cyclone synthétique, au dixième de mm.
    d2 = (GRID_LAT + 20) ** 2 + (GRID_LON - 55) ** 2
    return np.round(12 * np.exp(-d2 / (2 * 4.0**2)), 1)


def wind(component):
    # Vent uniforme u = 3, v = −4 m/s : 5 m/s (18 km/h) partout.
    return np.full(GRID_LAT.shape, 3.0 if component == 'u' else -4.0)


def write(path, valid, offset):
    writer = OmFileWriter(str(path))
    metadata = {'run_id': 'wn2-oper-20261019T060000Z-fixture', 'init_time': '2026-10-19T06:00:00Z',
                'valid_time': valid}
    children = [writer.write_scalar(json.dumps(metadata), 'metadata')]
    for name, values, factor in (('pressure_msl', pressure(offset), 20.0),
                                 ('cyclone_existence_probability', probability(), 1000.0),
                                 ('precipitation', precipitation(), 10.0),
                                 ('wind_u_component_10m', wind('u'), 100.0),
                                 ('wind_v_component_10m', wind('v'), 100.0)):
        children.append(writer.write_array(values.astype(np.float32), chunks=(64, 64),
                                           scale_factor=factor, add_offset=0,
                                           compression='pfor_delta_2d_int16', name=name))
    writer.close(writer.write_group('', children))


def main(root):
    base = Path(root) / 'data_spatial' / DOMAIN
    variables = ['pressure_msl', 'cyclone_existence_probability']
    latest = {'completed': True, 'last_modified_time': '2026-10-19T08:10:00Z',
              'reference_time': '2026-10-19T00:00:00Z',
              'valid_times': [f'2026-10-{19 + h // 24}T{h % 24:02d}:00:00Z' for h in range(6, 73, 6)],
              'variables': variables}
    run = base / '2026' / '10' / '19' / '0600Z'
    run.mkdir(parents=True, exist_ok=True)
    deposited = ['2026-10-19T12:00:00Z', '2026-10-19T18:00:00Z']
    for k, valid in enumerate(deposited):
        write(run / (valid[:13] + '00.om'), valid, k)
    in_progress = {'completed': False, 'last_modified_time': '2026-10-19T14:05:00Z',
                   'reference_time': '2026-10-19T06:00:00Z', 'valid_times': deposited,
                   'variables': variables + ['precipitation', 'wind_u_component_10m',
                                             'wind_v_component_10m']}
    (base / '2026' / '10' / '19' / '0000Z').mkdir(parents=True, exist_ok=True)
    (base / '2026' / '10' / '19' / '0000Z' / 'meta.json').write_text(json.dumps(latest) + '\n')
    (base / 'latest.json').write_text(json.dumps(latest) + '\n')
    (base / 'in-progress.json').write_text(json.dumps(in_progress) + '\n')


if __name__ == '__main__':
    main(sys.argv[1])
