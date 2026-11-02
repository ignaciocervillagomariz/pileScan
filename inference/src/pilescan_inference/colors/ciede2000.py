"""CIEDE2000 color difference (Sharma, Wu, Dalal 2005), vectorized with numpy.

Implemented from the paper's equations rather than a dependency; verified against the
34 reference pairs from the paper in tests/test_ciede2000.py.
"""

import numpy as np


def ciede2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """Return delta E 2000 between Lab colors; inputs broadcast over their leading axes."""
    lab1 = np.asarray(lab1, dtype=np.float64)
    lab2 = np.asarray(lab2, dtype=np.float64)
    l1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    l2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]

    c_bar = (np.hypot(a1, b1) + np.hypot(a2, b2)) / 2
    g = 0.5 * (1 - np.sqrt(c_bar**7 / (c_bar**7 + 25.0**7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360

    dl = l2 - l1
    dc = c2p - c1p
    dh_angle = h2p - h1p
    dh_angle = np.where(dh_angle > 180, dh_angle - 360, dh_angle)
    dh_angle = np.where(dh_angle < -180, dh_angle + 360, dh_angle)
    dh_angle = np.where(c1p * c2p == 0, 0.0, dh_angle)
    dh = 2 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh_angle) / 2)

    l_bar = (l1 + l2) / 2
    cp_bar = (c1p + c2p) / 2
    h_sum = h1p + h2p
    h_bar = np.where(
        c1p * c2p == 0,
        h_sum,
        np.where(
            np.abs(h1p - h2p) <= 180,
            h_sum / 2,
            np.where(h_sum < 360, (h_sum + 360) / 2, (h_sum - 360) / 2),
        ),
    )

    t = (
        1
        - 0.17 * np.cos(np.radians(h_bar - 30))
        + 0.24 * np.cos(np.radians(2 * h_bar))
        + 0.32 * np.cos(np.radians(3 * h_bar + 6))
        - 0.20 * np.cos(np.radians(4 * h_bar - 63))
    )
    d_theta = 30 * np.exp(-(((h_bar - 275) / 25) ** 2))
    r_c = 2 * np.sqrt(cp_bar**7 / (cp_bar**7 + 25.0**7))
    s_l = 1 + 0.015 * (l_bar - 50) ** 2 / np.sqrt(20 + (l_bar - 50) ** 2)
    s_c = 1 + 0.045 * cp_bar
    s_h = 1 + 0.015 * cp_bar * t
    r_t = -np.sin(np.radians(2 * d_theta)) * r_c

    return np.sqrt(
        (dl / s_l) ** 2 + (dc / s_c) ** 2 + (dh / s_h) ** 2 + r_t * (dc / s_c) * (dh / s_h)
    )
