# Compute resources

Two places run heavy work. Use the Nomad cluster (strangelove) for shared,
long, or many-node jobs. Use the personal Linux box `desk` for interactive
GPU work, local Docker runs of the Atomic tool images, and work that must not
wait in the cluster queue.

- Reach `desk` with `ssh desk-dock` (cable from the Thunderbolt dock,
  192.168.77.2), `ssh desk` (Tailscale), or `ssh desk-wifi` (same LAN). The ssh
  config that chezmoi manages documents each path.
- `desk` runs Pop!_OS 22.04 on an Intel i7-14700K (20 cores, 28 threads) with
  62 GiB RAM, an NVIDIA RTX 4070 Ti SUPER (16 GiB, driver 580, CUDA 13.0), a
  2 TB NVMe root disk, and a 1 TB second NVMe disk.
- Docker 29 on `desk` has the NVIDIA runtime. `docker run --gpus all` works.
  The user is in the docker group and is logged in to the ECR and cr.atmc.dev
  registries.
- The account on `desk` has sudo only with a password. Do the work you can as
  the user. For apt, driver, or shell changes, write a script and ask the
  user to run it with sudo.
- `desk` accepts tailnet subnet routes, so office names (cr.atmc.dev,
  nomad.service.consul) and the NAS at 10.10.20.241 resolve and route from
  it. Keep the cable link off 10.0.0.0/8: the tailnet advertises 10.0.0.0/16.
- `desk` is a desktop, not a server. A job on it stops when the box sleeps
  or reboots. Keep inputs and outputs under `~/work` on `desk`, or on the
  shared NAS.
