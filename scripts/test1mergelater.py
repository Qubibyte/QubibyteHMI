import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit_aer import Aer
from qiskit.visualization import (
    plot_histogram, circuit_drawer, plot_state_city, plot_bloch_multivector
)
import matplotlib.pyplot as plt
"""
# === Bell state circuit with measurement ===
qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])

# === Run qasm simulator ===
backend = Aer.get_backend('qasm_simulator')
t_qc = transpile(qc, backend)
job = backend.run(t_qc, shots=2**16)
counts = job.result().get_counts()

# === Draw circuit + measurement histogram ===
fig1, axes1 = plt.subplots(1, 2, figsize=(12, 4))
circuit_drawer(qc, output='mpl', ax=axes1[0])
axes1[0].set_title("Bell State Circuit")
plot_histogram(counts, ax=axes1[1])
axes1[1].set_title("Measurement Results")
plt.tight_layout()
plt.show()


# === Create a copy WITHOUT measurement for statevector ===
qc_sv = QuantumCircuit(2)
qc_sv.h(0)
qc_sv.cx(0, 1)

# === Run statevector simulator ===
sv_backend = Aer.get_backend('statevector_simulator')
job_sv = sv_backend.run(qc_sv)
statevector = job_sv.result().get_statevector()

# === Print the statevector ===
print("Statevector before measurement:")
print(statevector)

# === Show statevector visualizations ===
plot_state_city(statevector, title="Statevector (City Plot)")
plt.show()

plot_bloch_multivector(statevector, title="Bloch Multivector")
plt.show()
"""

# === Create a copy WITHOUT measurement for statevector ===
qc_sv = QuantumCircuit(5)
qc_sv.rx(np.pi/5, 0)
qc_sv.rx(2 * np.pi/5, 1)
qc_sv.rx(3 * np.pi/5, 2)
qc_sv.rx(4 * np.pi/5, 3)
qc_sv.rx(5 * np.pi/5, 4)

# === Run statevector simulator ===
sv_backend = Aer.get_backend('statevector_simulator')
job_sv = sv_backend.run(qc_sv)
statevector = job_sv.result().get_statevector()

# === Print the statevector ===
print("Statevector before measurement:")
print(statevector)

# === Show statevector visualizations ===
plot_state_city(statevector, title="Statevector (City Plot)")
plt.show()

plot_bloch_multivector(statevector, title="Bloch Multivector")
plt.show()