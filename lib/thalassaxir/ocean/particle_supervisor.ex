defmodule Thalassaxir.Ocean.ParticleSupervisor do
  @moduledoc """
  DynamicSupervisor that manages all ship processes.
  Ships can be spawned, killed, and repaired at runtime.
  Tracks crash positions for repair animations.
  """
  use DynamicSupervisor

  alias Thalassaxir.Ocean.Particle

  @crash_table :particle_crash_positions
  # Note: max_particles limit now enforced in Session module
  # @max_particles 200

  def start_link(opts) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    # Create ETS table for tracking crash positions
    :ets.new(@crash_table, [:named_table, :public, :set])
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Records crash position for repair animation.
  Called by a particle before it dies.
  """
  def record_crash(id, position, color) do
    :ets.insert(@crash_table, {id, position, color, DateTime.utc_now()})
  end

  @doc """
  Gets and removes crash data for a restarting ship.
  Returns {:ok, position, color} or :error.
  """
  def pop_crash_data(id) do
    case :ets.lookup(@crash_table, id) do
      [{^id, position, color, _time}] ->
        :ets.delete(@crash_table, id)
        {:ok, position, color}

      [] ->
        :error
    end
  end

  @doc """
  Spawns a new ship process.
  If crash data exists for this ID, spawns as a repair.
  """
  def spawn_particle(opts \\ []) do
    id = Keyword.get(opts, :id, generate_id())

    # Check if this is a repair (crashed ship being restarted)
    opts =
      case pop_crash_data(id) do
        {:ok, position, color} ->
          opts
          |> Keyword.put(:id, id)
          |> Keyword.put(:position, position)
          |> Keyword.put(:color, color)
          |> Keyword.put(:is_repair, true)

        :error ->
          Keyword.put(opts, :id, id)
      end

    child_spec = %{
      id: id,
      start: {Particle, :start_link, [opts]},
      # Restart on any non-normal exit for supervisor repair
      restart: :transient
    }

    case DynamicSupervisor.start_child(__MODULE__, child_spec) do
      {:ok, pid} -> {:ok, pid, id}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Spawns multiple particles.
  """
  def spawn_particles(count, opts \\ []) when count > 0 do
    Enum.map(1..count, fn _ -> spawn_particle(opts) end)
  end

  @doc """
  Kills a specific particle by ID.
  """
  def kill_particle(id) do
    Particle.kill(id)
  end

  @doc """
  Kills a random particle.
  """
  def kill_random_particle do
    case list_particle_ids() do
      [] ->
        {:error, :no_particles}

      ids ->
        id = Enum.random(ids)
        kill_particle(id)
    end
  end

  @doc """
  Crashes a random particle - supervisor will restart it.
  """
  def crash_random_particle do
    case list_particle_ids() do
      [] ->
        {:error, :no_particles}

      ids ->
        id = Enum.random(ids)
        Particle.crash(id)
    end
  end

  @doc """
  Storm damages random particles (marks as needing repair).
  """
  def storm_random_particle do
    ids = list_particle_ids()
    IO.inspect(ids, label: "list_particle_ids")
    
    case ids do
      [] ->
        IO.puts("No particles to storm!")
        {:error, :no_particles}

      ids ->
        id = Enum.random(ids)
        IO.inspect(id, label: "Storming particle")
        Particle.storm(id)
    end
  end

  @doc """
  Kills all particles with staggered delays for visual effect.
  """
  def kill_all_particles do
    # Get PIDs directly from supervisor (more reliable than registry)
    pids =
      DynamicSupervisor.which_children(__MODULE__)
      |> Enum.map(fn {_, pid, _, _} -> pid end)
      |> Enum.filter(&is_pid/1)

    pids
    |> Enum.with_index()
    |> Enum.each(fn {pid, index} ->
      delay = index * 2 + :rand.uniform(10)

      Task.start(fn ->
        Process.sleep(delay)
        # Terminate through supervisor
        DynamicSupervisor.terminate_child(__MODULE__, pid)
      end)
    end)

    :ok
  end

  @doc """
  Returns the count of active particles.
  """
  def count_particles do
    DynamicSupervisor.count_children(__MODULE__).active
  end

  @doc """
  Returns list of all particle IDs.
  """
  def list_particle_ids do
    Registry.select(Thalassaxir.Ocean.ParticleRegistry, [{{:"$1", :_, :_}, [], [:"$1"]}])
  end

  @doc """
  Returns list of all particle PIDs.
  """
  def list_particle_pids do
    DynamicSupervisor.which_children(__MODULE__)
    |> Enum.map(fn {_, pid, _, _} -> pid end)
    |> Enum.filter(&is_pid/1)
  end

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end
end
