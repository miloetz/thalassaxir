defmodule Thalassaxir.Ocean do
  @moduledoc """
  Public API for the ocean particle simulation.
  This context provides a clean interface for spawning, killing,
  and querying particle processes.
  """

  alias Thalassaxir.Ocean.{Particle, ParticleSupervisor}
  alias Phoenix.PubSub

  @pubsub Thalassaxir.PubSub
  @topic "ocean:particles"

  # --- Particle Management ---

  @doc """
  Spawns a new particle process.
  Returns {:ok, pid, id} on success.
  """
  def spawn_particle(opts \\ []) do
    ParticleSupervisor.spawn_particle(opts)
  end

  @doc """
  Spawns multiple particles at once.
  """
  def spawn_particles(count, opts \\ []) when count > 0 do
    ParticleSupervisor.spawn_particles(count, opts)
  end

  @doc """
  Kills a specific particle by ID.
  """
  def kill_particle(id) do
    ParticleSupervisor.kill_particle(id)
  end

  @doc """
  Kills a random particle.
  """
  def kill_random_particle do
    ParticleSupervisor.kill_random_particle()
  end

  @doc """
  Kills all particles.
  """
  def kill_all_particles do
    ParticleSupervisor.kill_all_particles()
  end

  @doc """
  Crashes a random particle - supervisor will restart it.
  """
  def crash_random_particle do
    ParticleSupervisor.crash_random_particle()
  end

  @doc """
  Storm damages random particles - lighthouse will repair them.
  """
  def storm_random_particle do
    ParticleSupervisor.storm_random_particle()
  end

  @doc """
  Crashes a specific particle by ID - supervisor will restart it.
  """
  def crash_particle(id) do
    Particle.crash(id)
  end

  # --- State Queries ---

  @doc """
  Gets the state of a specific particle.
  """
  def get_particle(id) do
    Particle.get_state(id)
  end

  @doc """
  Returns the count of active particles.
  """
  def count_particles do
    ParticleSupervisor.count_particles()
  end

  @doc """
  Returns list of all particle IDs.
  """
  def list_particle_ids do
    ParticleSupervisor.list_particle_ids()
  end

  @doc """
  Returns all particle states as a list of maps.
  """
  def get_all_particle_states do
    list_particle_ids()
    |> Enum.map(&get_particle/1)
    |> Enum.filter(&match?({:ok, _}, &1))
    |> Enum.map(fn {:ok, state} -> state end)
  end

  # --- PubSub ---

  @doc """
  Subscribe to particle events.
  Events: {:particle_spawned, data}, {:particle_died, data}, {:particle_repairing, data}
  """
  def subscribe do
    PubSub.subscribe(@pubsub, @topic)
  end

  @doc """
  Unsubscribe from particle events.
  """
  def unsubscribe do
    PubSub.unsubscribe(@pubsub, @topic)
  end

  @doc """
  Returns the PubSub topic for particle events.
  """
  def topic, do: @topic

  # --- Ocean Configuration ---

  @doc """
  Returns the ocean bounds for positioning particles.
  """
  def ocean_bounds do
    %{
      x: {-50, 50},
      y: {-20, 20},
      z: {-50, 50}
    }
  end
end
