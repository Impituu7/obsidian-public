---
date: "2026-06-06"
tags:
  - "filsafat"
  - "matematika"
  - "sejarah"
  - "cantor"
  - "kronecker"
related:
  - "[[filsafat matematika]]"
  - "[[Filsafat Matematika 2]]"
---

# Ketakterhinggaan Cantor vs Kronecker

Konflik meletus pada akhir abad ke-19 mengenai status tak terhingga dalam matematika: memperebutkan apakah tak terhingga aktual (*actual infinity*) merupakan konsep yang sah.

## Teori Georg Cantor (1845–1918)
Cantor menunjukkan bahwa tak terhingga dapat diperlakukan sebagai objek aktual yang terukur dan memiliki tingkatan (bilangan transfinit). Ia membuktikan ketakterbilangan bilangan real (*uncountability of the reals*) lebih besar daripada ketakterhinggaan bilangan asli ($\mathbb{N}$).

### Bukti Argumentasi Diagonal Cantor
Asumsikan semua bilangan real di antara $0$ dan $1$ dapat didaftar (korespondensi satu-satu dengan bilangan asli $\mathbb{N}$). Representasi desimal daftar tersebut:

$$r_1 = 0.\mathbf{d_{11}}d_{12}d_{13}\dots$$
$$r_2 = 0.d_{21}\mathbf{d_{22}}d_{23}\dots$$
$$r_3 = 0.d_{31}d_{32}\mathbf{d_{33}}\dots$$

Cantor mengonstruksi bilangan real baru $d = 0.e_1e_2e_3\dots$ di mana digit ke-$i$ didefinisikan sebagai:

$$e_i = \begin{cases} 1 & \text{jika } d_{ii} \neq 1 \\ 2 & \text{jika } d_{ii} = 1 \end{cases}$$

Bilangan $d$ berbeda dari $r_1$ pada digit pertama: berbeda dari $r_2$ pada digit kedua: dan secara umum berbeda dari $r_i$ pada digit ke-$i$. Maka $d$ tidak ada di dalam daftar asli. Kontradiksi ini membuktikan bahwa bilangan real tidak terbilang (memiliki kardinalitas $\aleph_1 > \aleph_0$).

## Oposisi Leopold Kronecker (1823–1891)
Kronecker menyerang teori Cantor secara akademis dan pribadi:
* **Finitisme:** Kronecker meyakini hanya bilangan bulat positif yang diciptakan Tuhan: sisanya adalah hasil kerja manusia. Matematika harus didasarkan pada perhitungan finitistik konkret.
* **Serangan:** Kronecker menghalangi publikasi makalah Cantor dan menghambat karier akademisnya. Tekanan mental ini memicu depresi berat berkepanjangan pada Cantor hingga ia menghabiskan akhir hidupnya di sanatorium mental.
