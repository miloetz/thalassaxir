defmodule Thalassaxir.Release do
  @moduledoc """
  Release tasks. This app doesn't use a database, so migrate is a no-op.
  """

  def migrate do
    # No database - nothing to migrate
    :ok
  end
end
